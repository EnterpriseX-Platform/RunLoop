package notify

import (
	"github.com/gofiber/websocket/v2"
	"github.com/rs/zerolog/log"
)

// HandleWebSocket returns the websocket handler for /ws/channel/:name.
// Auth (JWT validation, project scoping) must be enforced by the
// surrounding middleware before this handler runs — by the time we get
// here, c.Locals("projectID") must be set.
//
// The protocol is one-way: server → client only. The client sends
// nothing back; we still drain the read loop so the connection's TCP
// keep-alive works and we can detect a half-closed socket.
func HandleWebSocket(hub *Hub) func(*websocket.Conn) {
	return func(conn *websocket.Conn) {
		name := conn.Params("name")
		if name == "" {
			conn.Close()
			return
		}
		projectID, _ := conn.Locals("projectID").(string)
		if projectID == "" {
			// Locals not set means auth middleware was skipped or failed.
			// Refuse to subscribe rather than join an unprotected channel.
			conn.Close()
			return
		}

		key := ChannelKey(projectID, name)
		sub := hub.Subscribe(key, 64)
		log.Info().Str("channel", key).Msg("notify: subscriber connected")

		// Drain any client → server frames in a goroutine so writes can run.
		closed := make(chan struct{})
		go func() {
			defer close(closed)
			for {
				if _, _, err := conn.ReadMessage(); err != nil {
					return
				}
			}
		}()

		// Push messages from the hub into the connection.
		for {
			select {
			case <-closed:
				hub.Unsubscribe(sub)
				log.Info().Str("channel", key).Msg("notify: subscriber disconnected (client closed)")
				return
			case msg, ok := <-sub.Send:
				if !ok {
					_ = conn.WriteMessage(websocket.CloseMessage, []byte{})
					return
				}
				if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
					hub.Unsubscribe(sub)
					log.Info().Str("channel", key).Err(err).Msg("notify: subscriber disconnected (write error)")
					return
				}
			}
		}
	}
}
