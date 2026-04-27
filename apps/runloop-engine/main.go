package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/websocket/v2"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/runloop/runloop-engine/internal/api"
	"github.com/runloop/runloop-engine/internal/cluster"
	"github.com/runloop/runloop-engine/internal/config"
	"github.com/runloop/runloop-engine/internal/db"
	"github.com/runloop/runloop-engine/internal/executor"
	"github.com/runloop/runloop-engine/internal/maintenance"
	"github.com/runloop/runloop-engine/internal/middleware"
	"github.com/runloop/runloop-engine/internal/notification"
	"github.com/runloop/runloop-engine/internal/queue"
	"github.com/runloop/runloop-engine/internal/scheduler"
	"github.com/runloop/runloop-engine/internal/secret"
	"github.com/runloop/runloop-engine/internal/tracing"
	"github.com/runloop/runloop-engine/internal/webhook"
	ws "github.com/runloop/runloop-engine/internal/websocket"
	"github.com/runloop/runloop-engine/internal/worker"
	"time"
)

func main() {
	// Load configuration
	cfg := config.Load()

	// Setup logging
	setupLogging(cfg)

	log.Info().
		Str("version", "1.0.0").
		Str("port", cfg.ServerPort).
		Msg("Starting RunLoop Engine")

	// Initialize database
	database, err := db.NewPostgres(cfg)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to database")
	}
	defer database.Close()

	// Initialize WebSocket hub
	hub := ws.NewHub()
	go hub.Run()

	// Initialize executor and flow executor (with parallel DAG scheduling).
	jobExecutor := executor.NewJobExecutor()
	// SecretStore decrypts ${{secrets.NAME}} placeholders against the
	// shared `secrets` table (same AES-256-GCM format Next.js uses). Without
	// this wired, the engine treats placeholders as literal strings.
	secretStore, err := secret.New(database)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to initialise SecretStore")
	}
	flowExecutor := executor.NewFlowExecutor(jobExecutor, database, nil, secretStore)
	jobExecutor.SetFlowExecutor(flowExecutor)

	// Initialize worker pool with WebSocket hub
	workerPool := worker.NewPool(cfg, database, jobExecutor, hub)
	workerPool.Start()
	defer workerPool.Stop()

	// Initialize scheduler manager
	schedulerManager, err := scheduler.NewManager(database, workerPool)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to create scheduler manager")
	}
	
	// Set WebSocket hub
	schedulerManager.SetHub(hub)

	// Initialize dependency manager and wire into worker pool
	depManager := scheduler.NewDependencyManager(database, schedulerManager)
	workerPool.SetOnExecutionComplete(func(ctx context.Context, schedulerID string, status string) {
		if err := depManager.CheckAndTriggerSuccessors(ctx, schedulerID, status); err != nil {
			log.Error().Err(err).Str("scheduler_id", schedulerID).Msg("Failed to check successors")
		}
	})

	if err := schedulerManager.Start(); err != nil {
		log.Fatal().Err(err).Msg("Failed to start scheduler manager")
	}
	defer schedulerManager.Stop()

	// Leader election + cluster-singleton jobs (retention, backfill).
	// Only the leader instance runs these; other nodes remain workers-only.
	rootCtx := context.Background()
	leader := cluster.NewLeader(database, 0x5255_4E4C_4F4F_50) // "RUNLOOP"
	retentionJob := maintenance.NewRetentionJob(database, 90, 24*time.Hour)
	backfillRunner := maintenance.NewBackfillRunner(database, schedulerManager.TriggerJob, 5)

	// DLQ stale escalator — leader-only background job that flips PENDING
	// entries older than 30 min into REVIEWING so they surface in a
	// dedicated tab instead of rotting in the default backlog.
	dlqStore := executor.NewDeadLetterQueue(database)
	dlqEscalatorStop := make(chan struct{})
	startDLQEscalator := func(ctx context.Context) {
		go func() {
			t := time.NewTicker(5 * time.Minute)
			defer t.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-dlqEscalatorStop:
					return
				case <-t.C:
					n, err := dlqStore.EscalateStale(ctx, 30*time.Minute)
					if err != nil {
						log.Warn().Err(err).Msg("DLQ escalator: tick failed")
					} else if n > 0 {
						log.Info().Int64("escalated", n).Msg("DLQ escalator: PENDING → REVIEWING")
					}
				}
			}
		}()
	}

	leader.OnBecomeLeader(func(ctx context.Context) {
		log.Info().Msg("Leader responsibilities: starting retention + backfill + dlq escalator")
		retentionJob.Start(ctx)
		// Backfill once on leader take-over
		backfillRunner.Run(ctx)
		startDLQEscalator(ctx)
	})
	leader.OnLoseLeader(func() {
		log.Warn().Msg("Leader responsibilities released")
		retentionJob.Stop()
		select {
		case dlqEscalatorStop <- struct{}{}:
		default:
		}
	})
	leader.Run(rootCtx)
	defer leader.Stop()

	// Initialize notification service
	notificationService := notification.NewService()
	_ = notificationService // Available for use in handlers

	// Initialize webhook handler
	webhookHandler := webhook.NewHandler(database, schedulerManager)

	// Initialize persistent job queue manager (PG + Redis + Rabbit + Kafka).
	// Consumers are started inside queueManager.Start() below after routes
	// are wired.
	queueManager := queue.NewManager(database, flowExecutor)

	// Load plugin registry from DB before wiring handlers so startup reflects
	// the installed set. Reload happens again on every install/uninstall.
	pluginRegistry := flowExecutor.PluginRegistry()
	if err := pluginRegistry.Reload(context.Background()); err != nil {
		log.Error().Err(err).Msg("plugin registry initial load failed")
	}

	// Initialize API handler
	handler := api.NewHandler(database, schedulerManager, workerPool, hub, queueManager, pluginRegistry)

	// Create Fiber app
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			log.Error().Err(err).Int("code", code).Msg("Request error")
			return c.Status(code).JSON(fiber.Map{
				"error": err.Error(),
			})
		},
		ReadTimeout:  cfg.ServerReadTimeout,
		WriteTimeout: cfg.ServerWriteTimeout,
	})

	// Middleware
	app.Use(recover.New())
	app.Use(tracing.Middleware()) // Assigns trace_id before logging so log lines carry it
	app.Use(middleware.LoggerMiddleware())
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowMethods: "GET,POST,PUT,DELETE,OPTIONS",
		AllowHeaders: "Origin,Content-Type,Accept,Authorization",
		ExposeHeaders: "X-Trace-ID",
	}))

	// Routes
	setupRoutes(app, handler, webhookHandler, cfg, hub, database)

	// Start queue consumers now that routes are declared. Each enabled queue
	// in job_queues spins up its own consumer goroutine; the reaper + dedupe
	// janitor also start here. Uses a context cancelled on shutdown.
	queueCtx, queueCancel := context.WithCancel(context.Background())
	if err := queueManager.Start(queueCtx); err != nil {
		log.Error().Err(err).Msg("failed to start queue manager (continuing without queues)")
	}

	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
		<-sigChan
		log.Info().Msg("Shutting down server...")
		queueCancel()
		queueManager.Stop()
		app.Shutdown()
	}()

	// Start server
	if err := app.Listen(":" + cfg.ServerPort); err != nil {
		log.Fatal().Err(err).Msg("Failed to start server")
	}

	log.Info().Msg("Server stopped")
}

func setupLogging(cfg *config.Config) {
	// Set log level
	level, err := zerolog.ParseLevel(cfg.LogLevel)
	if err != nil {
		level = zerolog.InfoLevel
	}
	zerolog.SetGlobalLevel(level)

	// Set output format
	if cfg.LogFormat == "console" {
		log.Logger = log.Output(zerolog.ConsoleWriter{
			Out:        os.Stdout,
			TimeFormat: "2006-01-02 15:04:05",
		})
	}
}

func setupRoutes(app *fiber.App, handler *api.Handler, webhookHandler *webhook.Handler, cfg *config.Config, hub *ws.Hub, database *db.Postgres) {
	// Get base path from config
	basePath := cfg.BasePath

	// Public routes
	app.Get(basePath+"/health", handler.HealthCheck)
	app.Get(basePath+"/stats", handler.GetStats)

	// Public webhook endpoint (no auth required)
	webhookHandler.RegisterRoutes(app, basePath)

	// WebSocket route for real-time execution updates
	app.Use(basePath+"/ws", func(c *fiber.Ctx) error {
		// Check if it's a WebSocket upgrade request
		if websocket.IsWebSocketUpgrade(c) {
			c.Locals("allowed", true)
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})
	app.Get(basePath+"/ws/executions/:id", websocket.New(ws.HandleWebSocket(hub)))

	// Protected routes (require JWT)
	apiGroup := app.Group(basePath+"/api", middleware.JWTMiddleware(cfg, database))

	// Schedulers
	apiGroup.Get("/schedulers", handler.ListSchedulers)
	apiGroup.Get("/schedulers/:id", handler.GetScheduler)
	apiGroup.Post("/schedulers", handler.CreateScheduler)
	apiGroup.Put("/schedulers/:id", handler.UpdateScheduler)
	apiGroup.Delete("/schedulers/:id", handler.DeleteScheduler)
	apiGroup.Post("/schedulers/:id/trigger", handler.TriggerScheduler)

	// Scheduler-Flow relationship
	apiGroup.Get("/schedulers/:id/flows", handler.GetSchedulerFlows)
	apiGroup.Post("/schedulers/:id/flows", handler.AttachFlows)
	apiGroup.Delete("/schedulers/:id/flows/:flowId", handler.DetachFlow)

	// Scheduler dependencies (Control-M style chaining)
	apiGroup.Get("/schedulers/:id/dependencies", handler.ListDependencies)
	apiGroup.Post("/schedulers/:id/dependencies", handler.AddDependency)
	apiGroup.Delete("/schedulers/:id/dependencies/:depId", handler.RemoveDependency)

	// Executions
	apiGroup.Get("/executions", handler.ListExecutions)
	apiGroup.Get("/executions/metrics", handler.GetExecutionMetrics)
	apiGroup.Get("/executions/:id", handler.GetExecution)
	apiGroup.Post("/executions/:id/replay", handler.ReplayExecution)
	apiGroup.Post("/executions/:id/cancel", handler.CancelExecution)
	apiGroup.Post("/executions/bulk-delete", handler.BulkDeleteExecutions)
	apiGroup.Post("/executions/bulk-retry", handler.BulkRetryExecutions)
	apiGroup.Get("/executions/:id/logs/realtime", handler.GetRealtimeLogs)

	// Dead Letter Queue — failed executions parked here after exceeding
	// retries / circuit-breaker / timeout. Operators can review, replay
	// (re-enqueue or re-trigger scheduler), discard, or resolve.
	apiGroup.Get("/dlq",                handler.ListDLQ)
	apiGroup.Get("/dlq/stats",          handler.GetDLQStats) // before /:id
	apiGroup.Get("/dlq/:id",            handler.GetDLQEntry)
	apiGroup.Post("/dlq/:id/review",    handler.ReviewDLQ)
	apiGroup.Post("/dlq/:id/replay",    handler.ReplayDLQ)
	apiGroup.Post("/dlq/:id/discard",   handler.DiscardDLQ)
	apiGroup.Post("/dlq/:id/resolve",   handler.ResolveDLQ)

	// Flows
	apiGroup.Get("/flows", handler.ListFlows)
	apiGroup.Get("/flows/:id", handler.GetFlow)
	apiGroup.Post("/flows", handler.CreateFlow)
	apiGroup.Post("/flows/test", handler.DryRunFlow) // Dry-run must be before /:id
	apiGroup.Put("/flows/:id", handler.UpdateFlow)
	apiGroup.Delete("/flows/:id", handler.DeleteFlow)

	// Tasks
	apiGroup.Get("/tasks", handler.ListTasks)
	apiGroup.Get("/tasks/:id", handler.GetTask)
	apiGroup.Post("/tasks", handler.CreateTask)
	apiGroup.Put("/tasks/:id", handler.UpdateTask)
	apiGroup.Delete("/tasks/:id", handler.DeleteTask)

	// Bulk operations
	apiGroup.Post("/bulk", handler.BulkOperations)

	// Job templates
	apiGroup.Get("/templates", handler.GetJobTemplates)

	// Webhook wait endpoint — unblocks WAIT_WEBHOOK nodes by correlation id.
	// Public (no JWT) because external systems (OAuth callbacks, payment
	// providers) won't carry our credentials. Anyone who knows the id wins;
	// flows should generate unguessable ids.
	app.Post(basePath+"/api/webhooks/wait/:id", executor.DefaultWaitRegistry().HTTPHandler)

	// Persistent job queues (PG / Redis / RabbitMQ / Kafka)
	apiGroup.Get("/queues", handler.ListQueues)
	apiGroup.Post("/queues", handler.CreateQueue)
	apiGroup.Get("/queues/:name", handler.GetQueue)
	apiGroup.Delete("/queues/:name", handler.DeleteQueue)
	apiGroup.Post("/queues/:name/jobs", handler.EnqueueJob)
	apiGroup.Get("/queues/:name/jobs", handler.ListJobs)
	apiGroup.Get("/queues/:name/stats", handler.QueueStats)
	apiGroup.Post("/queues/:name/jobs/:id/retry", handler.RetryJob)
	apiGroup.Delete("/queues/:name/jobs/:id", handler.DeleteJob)

	// Plugins (SDK-style extension nodes)
	apiGroup.Get("/plugins", handler.ListPlugins)
	apiGroup.Post("/plugins", handler.InstallPlugin)
	apiGroup.Patch("/plugins/:name", handler.SetPluginEnabled)
	apiGroup.Delete("/plugins/:name", handler.UninstallPlugin)
	apiGroup.Post("/plugins/:name/test", handler.TestPlugin)

	// Node templates (presets for existing node types)
	apiGroup.Get("/node-templates", handler.ListTemplates)
	apiGroup.Post("/node-templates", handler.CreateTemplate)
	apiGroup.Delete("/node-templates/:id", handler.DeleteTemplate)

	log.Info().Msg("Routes configured")
}
