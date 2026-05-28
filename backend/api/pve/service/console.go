package service

import (
	"crypto/tls"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

func pveConsoleCheckOrigin(r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return true
	}
	u, err := url.Parse(origin)
	return err == nil && strings.EqualFold(u.Host, r.Host)
}

func pveConsoleSubprotocols(r *http.Request) []string {
	protocols := websocket.Subprotocols(r)
	if len(protocols) == 0 {
		return []string{"binary"}
	}
	out := make([]string, 0, len(protocols))
	seen := map[string]struct{}{}
	for _, proto := range protocols {
		proto = strings.TrimSpace(proto)
		if proto == "" {
			continue
		}
		key := strings.ToLower(proto)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, proto)
	}
	if len(out) == 0 {
		return []string{"binary"}
	}
	return out
}

func pveConsoleUpgraderFor(r *http.Request) websocket.Upgrader {
	return websocket.Upgrader{
		CheckOrigin:  pveConsoleCheckOrigin,
		Subprotocols: pveConsoleSubprotocols(r),
	}
}

type pveGuestConsoleTicketBody struct {
	Node string `json:"node"`
	Type string `json:"type"`
}

func pveGuestConsoleTicketForm() url.Values {
	form := url.Values{}
	form.Set("websocket", "1")
	return form
}

func handlePVEGuestConsoleTicket(c *gin.Context, app *ServerApp) {
	if !requirePVEAdmin(c) {
		return
	}
	var body pveGuestConsoleTicketBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	proxyPath, _, err := pveGuestConsolePaths(body.Node, body.Type, c.Param("vmid"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	client, _, ok := pveClientForRequest(c, app)
	if !ok {
		return
	}
	data, err := client.Do(c.Request.Context(), http.MethodPost, proxyPath, nil, pveGuestConsoleTicketForm())
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"console": json.RawMessage(data)})
}

func handlePVEGuestConsoleWebSocket(c *gin.Context, app *ServerApp) {
	client, _, ok := pveClientForRequest(c, app)
	if !ok {
		return
	}
	node, guestType, vmid := pveGuestRequestScope(c)
	wsPath, err := pveGuestConsoleWebSocketPath(node, guestType, vmid)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	port := strings.TrimSpace(c.Query("port"))
	ticket := strings.TrimSpace(c.Query("vncticket"))
	if ticket == "" {
		ticket = strings.TrimSpace(c.Query("ticket"))
	}
	if port == "" || ticket == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "port and vncticket are required"})
		return
	}
	query := url.Values{}
	query.Set("port", port)
	query.Set("vncticket", ticket)
	remoteURL, err := client.APIWebSocketURL(wsPath, query)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	header, err := client.WebSocketAuthHeader(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	subprotocols := pveConsoleSubprotocols(c.Request)
	dialer := websocket.Dialer{Subprotocols: subprotocols}
	if client.SkipTLSVerify() {
		dialer.TLSClientConfig = &tls.Config{InsecureSkipVerify: true} //nolint:gosec // User explicitly configured PVE skip TLS verification.
	}
	remoteConn, _, err := dialer.DialContext(c.Request.Context(), remoteURL, header)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	defer remoteConn.Close()

	upgrader := pveConsoleUpgraderFor(c.Request)
	localConn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer localConn.Close()

	done := make(chan struct{}, 2)
	go pveProxyWebSocket(localConn, remoteConn, done)
	go pveProxyWebSocket(remoteConn, localConn, done)
	<-done
}

func pveProxyWebSocket(dst, src *websocket.Conn, done chan<- struct{}) {
	defer func() { done <- struct{}{} }()
	for {
		messageType, message, err := src.ReadMessage()
		if err != nil {
			return
		}
		if err := dst.WriteMessage(messageType, message); err != nil {
			return
		}
	}
}
