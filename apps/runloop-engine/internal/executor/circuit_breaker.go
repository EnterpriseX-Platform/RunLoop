package executor

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

// CircuitState represents the state of a circuit breaker
type CircuitState int

const (
	StateClosed CircuitState = iota    // Normal operation
	StateOpen                          // Failing, reject requests
	StateHalfOpen                      // Testing if service recovered
)

func (s CircuitState) String() string {
	switch s {
	case StateClosed:
		return "CLOSED"
	case StateOpen:
		return "OPEN"
	case StateHalfOpen:
		return "HALF_OPEN"
	default:
		return "UNKNOWN"
	}
}

// CircuitBreakerConfig holds circuit breaker configuration
type CircuitBreakerConfig struct {
	FailureThreshold int           // Number of failures before opening circuit
	SuccessThreshold int           // Number of successes in half-open to close
	Timeout          time.Duration // Time to wait before trying half-open
	HalfOpenMaxCalls int           // Max calls allowed in half-open state
}

// DefaultCircuitBreakerConfig returns default configuration
func DefaultCircuitBreakerConfig() *CircuitBreakerConfig {
	return &CircuitBreakerConfig{
		FailureThreshold: 5,
		SuccessThreshold: 3,
		Timeout:          30 * time.Second,
		HalfOpenMaxCalls: 3,
	}
}

// CircuitBreaker implements the circuit breaker pattern
type CircuitBreaker struct {
	name   string
	config *CircuitBreakerConfig

	state     CircuitState
	stateMu   sync.RWMutex

	failures    int
	successes   int
	lastFailure time.Time
	countsMu    sync.Mutex

	halfOpenCalls   int
	halfOpenCallsMu sync.Mutex
}

// NewCircuitBreaker creates a new circuit breaker
func NewCircuitBreaker(name string, config *CircuitBreakerConfig) *CircuitBreaker {
	if config == nil {
		config = DefaultCircuitBreakerConfig()
	}

	return &CircuitBreaker{
		name:   name,
		config: config,
		state:  StateClosed,
	}
}

// Execute runs a function with circuit breaker protection
func (cb *CircuitBreaker) Execute(fn func() error) error {
	state := cb.currentState()

	switch state {
	case StateOpen:
		// Check if timeout has passed to transition to half-open
		if cb.shouldAttemptReset() {
			cb.transitionTo(StateHalfOpen)
		} else {
			return fmt.Errorf("circuit breaker '%s' is OPEN: %w", cb.name, ErrCircuitOpen)
		}

	case StateHalfOpen:
		// Limit concurrent calls in half-open state
		if !cb.canAttemptHalfOpen() {
			return fmt.Errorf("circuit breaker '%s' is HALF_OPEN (max calls reached): %w", cb.name, ErrCircuitOpen)
		}
	}

	// Execute the function
	err := fn()

	// Record result
	cb.recordResult(err)

	return err
}

// currentState returns the current state
func (cb *CircuitBreaker) currentState() CircuitState {
	cb.stateMu.RLock()
	defer cb.stateMu.RUnlock()
	return cb.state
}

// transitionTo changes the circuit state
func (cb *CircuitBreaker) transitionTo(state CircuitState) {
	cb.stateMu.Lock()
	defer cb.stateMu.Unlock()

	oldState := cb.state
	cb.state = state

	// Reset counters on state change
	cb.countsMu.Lock()
	cb.failures = 0
	cb.successes = 0
	cb.countsMu.Unlock()

	cb.halfOpenCallsMu.Lock()
	cb.halfOpenCalls = 0
	cb.halfOpenCallsMu.Unlock()

	// Log state change (in production, use proper logging)
	fmt.Printf("Circuit breaker '%s': %s -> %s\n", cb.name, oldState, state)
}

// shouldAttemptReset checks if enough time has passed to try half-open
func (cb *CircuitBreaker) shouldAttemptReset() bool {
	cb.countsMu.Lock()
	defer cb.countsMu.Unlock()
	return time.Since(cb.lastFailure) > cb.config.Timeout
}

// canAttemptHalfOpen checks if we can make another call in half-open state
func (cb *CircuitBreaker) canAttemptHalfOpen() bool {
	cb.halfOpenCallsMu.Lock()
	defer cb.halfOpenCallsMu.Unlock()
	
	if cb.halfOpenCalls < cb.config.HalfOpenMaxCalls {
		cb.halfOpenCalls++
		return true
	}
	return false
}

// recordResult records the result of a function execution
func (cb *CircuitBreaker) recordResult(err error) {
	cb.countsMu.Lock()
	defer cb.countsMu.Unlock()

	state := cb.currentState()

	if err != nil {
		cb.failures++
		cb.lastFailure = time.Now()

		switch state {
		case StateClosed:
			if cb.failures >= cb.config.FailureThreshold {
				cb.transitionTo(StateOpen)
			}
		case StateHalfOpen:
			cb.transitionTo(StateOpen)
		}
	} else {
		cb.successes++

		switch state {
		case StateHalfOpen:
			if cb.successes >= cb.config.SuccessThreshold {
				cb.transitionTo(StateClosed)
			}
		case StateClosed:
			// Reset failures on success
			cb.failures = 0
		}
	}
}

// GetState returns the current state and statistics
func (cb *CircuitBreaker) GetState() (CircuitState, int, int) {
	cb.stateMu.RLock()
	state := cb.state
	cb.stateMu.RUnlock()

	cb.countsMu.Lock()
	failures := cb.failures
	successes := cb.successes
	cb.countsMu.Unlock()

	return state, failures, successes
}

// Reset manually resets the circuit breaker to closed state
func (cb *CircuitBreaker) Reset() {
	cb.transitionTo(StateClosed)
}

// ForceOpen manually opens the circuit
func (cb *CircuitBreaker) ForceOpen() {
	cb.transitionTo(StateOpen)
}

// Errors
var (
	ErrCircuitOpen = errors.New("circuit breaker is open")
)

// CircuitBreakerManager manages multiple circuit breakers
type CircuitBreakerManager struct {
	breakers map[string]*CircuitBreaker
	mu       sync.RWMutex
	config   *CircuitBreakerConfig
}

// NewCircuitBreakerManager creates a new manager
func NewCircuitBreakerManager(config *CircuitBreakerConfig) *CircuitBreakerManager {
	return &CircuitBreakerManager{
		breakers: make(map[string]*CircuitBreaker),
		config:   config,
	}
}

// GetOrCreate gets or creates a circuit breaker
func (m *CircuitBreakerManager) GetOrCreate(name string) *CircuitBreaker {
	m.mu.RLock()
	cb, exists := m.breakers[name]
	m.mu.RUnlock()

	if exists {
		return cb
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	// Double-check after locking
	if cb, exists := m.breakers[name]; exists {
		return cb
	}

	cb = NewCircuitBreaker(name, m.config)
	m.breakers[name] = cb
	return cb
}

// Get retrieves a circuit breaker by name
func (m *CircuitBreakerManager) Get(name string) (*CircuitBreaker, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	cb, exists := m.breakers[name]
	return cb, exists
}

// Remove removes a circuit breaker
func (m *CircuitBreakerManager) Remove(name string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.breakers, name)
}

// GetAll returns all circuit breakers
func (m *CircuitBreakerManager) GetAll() map[string]*CircuitState {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make(map[string]*CircuitState)
	for name, cb := range m.breakers {
		state := cb.currentState()
		result[name] = &state
	}
	return result
}

// ResetAll resets all circuit breakers
func (m *CircuitBreakerManager) ResetAll() {
	m.mu.RLock()
	breakers := make([]*CircuitBreaker, 0, len(m.breakers))
	for _, cb := range m.breakers {
		breakers = append(breakers, cb)
	}
	m.mu.RUnlock()

	for _, cb := range breakers {
		cb.Reset()
	}
}
