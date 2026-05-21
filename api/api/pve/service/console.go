package service

import (
	"crypto/tls"
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var pveConsoleUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := strings.TrimSpace(r.Header.Get("Origin"))
		if origin == "" {
			return true
		}
		u, err := url.Parse(origin)
		return err == nil && strings.EqualFold(u.Host, r.Host)
	},
}

type pveGuestConsoleTicketBody struct {
	Node   string `json:"node"`
	Type   string `json:"type"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
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
	form := url.Values{}
	form.Set("websocket", "1")
	if body.Width > 0 {
		form.Set("width", strconv.Itoa(body.Width))
	}
	if body.Height > 0 {
		form.Set("height", strconv.Itoa(body.Height))
	}
	data, err := client.Do(c.Request.Context(), http.MethodPost, proxyPath, nil, form)
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
	dialer := websocket.Dialer{}
	if client.SkipTLSVerify() {
		dialer.TLSClientConfig = &tls.Config{InsecureSkipVerify: true} //nolint:gosec // User explicitly configured PVE skip TLS verification.
	}
	remoteConn, _, err := dialer.DialContext(c.Request.Context(), remoteURL, header)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	defer remoteConn.Close()

	localConn, err := pveConsoleUpgrader.Upgrade(c.Writer, c.Request, nil)
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
