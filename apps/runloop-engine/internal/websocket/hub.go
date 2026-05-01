package websocket

import (
	"sync"

	"github.com/gofiber/websocket/v2"
	"github.com/rs/zerolog/log"
)

// Hub maintains the set of active clients and broadcasts messages
type Hub struct {
	clients    map[string]map[*Client]bool // executionID -> clients
	broadcast  chan *Message
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
}

// Client is a middleman between the websocket connection and the hub
type Client struct {
	hub         *Hub
	conn        *websocket.Conn
	send        chan []byte
	executionID string
}

// Message represents a message to be broadcast
type Message struct {
	ExecutionID string
	Data        []byte
}

// NewHub creates a new Hub instance
func NewHub() *Hub {
	return &Hub{
		broadcast:  make(chan *Message),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		clients:    make(map[string]map[*Client]bool),
	}
}

// Run starts the hub
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			if h.clients[client.executionID] == nil {
				h.clients[client.executionID] = make(map[*Client]bool)
			}
			h.clients[client.executionID][client] = true
			h.mu.Unlock()
			log.Debug().Str("execution_id", client.executionID).Msg("Client registered")

		case client := <-h.unregister:
			h.mu.Lock()
			if clients, ok := h.clients[client.executionID]; ok {
				if _, ok := clients[client]; ok {
					delete(clients, client)
					close(client.send)
					if len(clients) == 0 {
						delete(h.clients, client.executionID)
					}
				}
			}
			h.mu.Unlock()
			log.Debug().Str("execution_id", client.executionID).Msg("Client unregistered")

		case message := <-h.broadcast:
			h.mu.RLock()
			clients := h.clients[message.ExecutionID]
			h.mu.RUnlock()

			for client := range clients {
				select {
				case client.send <- message.Data:
				default:
					close(client.send)
					delete(clients, client)
				}
			}
		}
	}
}

// Broadcast sends a message to all clients subscribed to an execution
func (h *Hub) Broadcast(executionID string, data []byte) {
	h.broadcast <- &Message{
		ExecutionID: executionID,
		Data:        data,
	}
}

// HandleWebSocket handles websocket connections
func HandleWebSocket(hub *Hub) func(*websocket.Conn) {
	return func(conn *websocket.Conn) {
		executionID := conn.Params("id")
		if executionID == "" {
			log.Warn().Msg("WebSocket connection without execution ID")
			conn.Close()
			return
		}

		client := &Client{
			hub:         hub,
			conn:        conn,
			send:        make(chan []byte, 256),
			executionID: executionID,
		}

		hub.register <- client

		go client.writePump()
		go client.readPump()
	}
}

// readPump pumps messages from the websocket connection to the hub
func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	for {
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Error().Err(err).Msg("WebSocket error")
			}
			break
		}
	}
}

// writePump pumps messages from the hub to the websocket connection
func (c *Client) writePump() {
	defer func() {
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				log.Error().Err(err).Msg("WebSocket write error")
				return
			}
		}
	}
}
