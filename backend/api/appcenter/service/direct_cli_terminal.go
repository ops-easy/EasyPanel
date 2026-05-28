package service

import (
	"context"
	"encoding/json"
	"strings"
	"unicode/utf8"

	"github.com/gorilla/websocket"
)

type directCLIResult struct {
	Output string
	Prompt string
	Close  bool
}

type directCLIExecutor func(context.Context, string) directCLIResult

func runDirectCLITerminal(ctx context.Context, conn *websocket.Conn, initialPrompt, intro string, exec directCLIExecutor) {
	if conn == nil || exec == nil {
		return
	}
	prompt := initialPrompt
	if prompt == "" {
		prompt = "> "
	}
	if intro != "" {
		writeWebSocketTerminalText(conn, intro)
	}
	writeWebSocketTerminalText(conn, prompt)

	var line []rune
	skipEscape := false
	for {
		mt, data, err := conn.ReadMessage()
		if err != nil {
			return
		}
		if directCLIShouldIgnoreMessage(mt, data) {
			continue
		}
		for len(data) > 0 {
			r, n := utf8.DecodeRune(data)
			if r == utf8.RuneError && n == 1 {
				data = data[n:]
				continue
			}
			data = data[n:]
			if skipEscape {
				if directCLIEscapeSequenceDone(r) {
					skipEscape = false
				}
				continue
			}
			switch r {
			case '\x1b':
				skipEscape = true
			case '\x03':
				line = line[:0]
				writeWebSocketTerminalText(conn, "^C\r\n"+prompt)
			case '\x04':
				writeWebSocketTerminalText(conn, "\r\n")
				return
			case '\b', '\x7f':
				if len(line) > 0 {
					line = line[:len(line)-1]
					writeWebSocketTerminalText(conn, "\b \b")
				}
			case '\r', '\n':
				writeWebSocketTerminalText(conn, "\r\n")
				res := exec(ctx, string(line))
				line = line[:0]
				if res.Output != "" {
					writeWebSocketTerminalText(conn, res.Output)
				}
				if res.Close {
					return
				}
				if strings.TrimSpace(res.Prompt) != "" || res.Prompt != "" {
					prompt = res.Prompt
				}
				writeWebSocketTerminalText(conn, prompt)
			default:
				if r >= 0x20 || r == '\t' {
					line = append(line, r)
					writeWebSocketTerminalText(conn, string(r))
				}
			}
		}
	}
}

func directCLIShouldIgnoreMessage(messageType int, data []byte) bool {
	if messageType != websocket.TextMessage {
		return false
	}
	s := strings.TrimSpace(string(data))
	if !strings.HasPrefix(s, "{") {
		return false
	}
	var payload struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		return false
	}
	return payload.Type == "resize"
}

func directCLIEscapeSequenceDone(r rune) bool {
	return (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || r == '~'
}

func writeWebSocketTerminalText(conn *websocket.Conn, msg string) {
	if conn == nil || msg == "" {
		return
	}
	_ = conn.WriteMessage(websocket.TextMessage, []byte(msg))
}
