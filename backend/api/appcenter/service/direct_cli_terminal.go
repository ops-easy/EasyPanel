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
	editor := newDirectCLILineEditor(initialPrompt)
	if intro != "" {
		writeWebSocketTerminalText(conn, intro)
	}
	writeWebSocketTerminalText(conn, editor.prompt)

	for {
		mt, data, err := conn.ReadMessage()
		if err != nil {
			return
		}
		if directCLIShouldIgnoreMessage(mt, data) {
			continue
		}
		out, lines, closeNow := editor.feedBytes(data)
		writeWebSocketTerminalText(conn, out)
		if closeNow {
			return
		}
		for _, line := range lines {
			res := exec(ctx, line)
			if res.Output != "" {
				writeWebSocketTerminalText(conn, res.Output)
			}
			if res.Close {
				return
			}
			if strings.TrimSpace(res.Prompt) != "" || res.Prompt != "" {
				editor.setPrompt(res.Prompt)
			}
			writeWebSocketTerminalText(conn, editor.prompt)
		}
	}
}

type directCLILineEditor struct {
	prompt       string
	line         []rune
	cursor       int
	history      []string
	historyIndex int
	draft        []rune
	escape       []rune
	completions  []string
	lastTabToken string
}

func newDirectCLILineEditor(prompt string) *directCLILineEditor {
	if prompt == "" {
		prompt = "> "
	}
	return &directCLILineEditor{
		prompt:       prompt,
		historyIndex: -1,
		completions:  directCLICompletionWords(prompt),
	}
}

func (e *directCLILineEditor) setPrompt(prompt string) {
	if prompt == "" {
		return
	}
	e.prompt = prompt
	e.completions = directCLICompletionWords(prompt)
}

func (e *directCLILineEditor) feedString(s string) (string, []string, bool) {
	return e.feedBytes([]byte(s))
}

func (e *directCLILineEditor) feedBytes(data []byte) (string, []string, bool) {
	var out strings.Builder
	var lines []string
	for len(data) > 0 {
		r, n := utf8.DecodeRune(data)
		if r == utf8.RuneError && n == 1 {
			data = data[n:]
			continue
		}
		data = data[n:]
		if len(e.escape) > 0 {
			e.escape = append(e.escape, r)
			if directCLIEscapeComplete(e.escape) {
				out.WriteString(e.handleEscape(string(e.escape)))
				e.escape = nil
			}
			continue
		}
		switch r {
		case '\x1b':
			e.escape = []rune{r}
		case '\x01':
			out.WriteString(e.moveHome())
		case '\x02':
			out.WriteString(e.moveLeft())
		case '\x03':
			e.resetHistoryNavigation()
			e.line = nil
			e.cursor = 0
			out.WriteString("^C\r\n")
			out.WriteString(e.prompt)
		case '\x04':
			if len(e.line) == 0 {
				out.WriteString("\r\n")
				return out.String(), lines, true
			}
		case '\x05':
			out.WriteString(e.moveEnd())
		case '\x06':
			out.WriteString(e.moveRight())
		case '\x0b':
			e.detachHistoryForEdit()
			e.line = e.line[:e.cursor]
			out.WriteString(e.redraw())
		case '\x0c':
			out.WriteString("\x1b[2J\x1b[H")
			out.WriteString(e.redraw())
		case '\x15':
			e.detachHistoryForEdit()
			e.line = append([]rune{}, e.line[e.cursor:]...)
			e.cursor = 0
			out.WriteString(e.redraw())
		case '\x17':
			out.WriteString(e.deletePreviousWord())
		case '\b', '\x7f':
			out.WriteString(e.backspace())
		case '\t':
			out.WriteString(e.completeToken())
		case '\r', '\n':
			out.WriteString("\r\n")
			line := string(e.line)
			e.addHistory(line)
			lines = append(lines, line)
			e.line = nil
			e.cursor = 0
			e.resetHistoryNavigation()
		default:
			if r >= 0x20 {
				out.WriteString(e.insertRune(r))
			}
		}
	}
	return out.String(), lines, false
}

func (e *directCLILineEditor) insertRune(r rune) string {
	e.lastTabToken = ""
	e.detachHistoryForEdit()
	if e.cursor == len(e.line) {
		e.line = append(e.line, r)
		e.cursor++
		return string(r)
	}
	next := append([]rune{}, e.line[:e.cursor]...)
	next = append(next, r)
	next = append(next, e.line[e.cursor:]...)
	e.line = next
	e.cursor++
	return e.redraw()
}

func (e *directCLILineEditor) backspace() string {
	if e.cursor <= 0 {
		return ""
	}
	e.lastTabToken = ""
	e.detachHistoryForEdit()
	e.line = append(e.line[:e.cursor-1], e.line[e.cursor:]...)
	e.cursor--
	return e.redraw()
}

func (e *directCLILineEditor) deleteAtCursor() string {
	if e.cursor >= len(e.line) {
		return ""
	}
	e.lastTabToken = ""
	e.detachHistoryForEdit()
	e.line = append(e.line[:e.cursor], e.line[e.cursor+1:]...)
	return e.redraw()
}

func (e *directCLILineEditor) deletePreviousWord() string {
	if e.cursor <= 0 {
		return ""
	}
	e.lastTabToken = ""
	e.detachHistoryForEdit()
	start := e.cursor
	for start > 0 && e.line[start-1] == ' ' {
		start--
	}
	for start > 0 && e.line[start-1] != ' ' {
		start--
	}
	e.line = append(e.line[:start], e.line[e.cursor:]...)
	e.cursor = start
	return e.redraw()
}

func (e *directCLILineEditor) moveHome() string {
	if e.cursor == 0 {
		return ""
	}
	out := strings.Repeat("\x1b[D", e.cursor)
	e.cursor = 0
	return out
}

func (e *directCLILineEditor) moveEnd() string {
	if e.cursor >= len(e.line) {
		return ""
	}
	n := len(e.line) - e.cursor
	e.cursor = len(e.line)
	return strings.Repeat("\x1b[C", n)
}

func (e *directCLILineEditor) moveLeft() string {
	if e.cursor <= 0 {
		return ""
	}
	e.cursor--
	return "\x1b[D"
}

func (e *directCLILineEditor) moveRight() string {
	if e.cursor >= len(e.line) {
		return ""
	}
	e.cursor++
	return "\x1b[C"
}

func (e *directCLILineEditor) historyPrev() string {
	if len(e.history) == 0 {
		return "\a"
	}
	if e.historyIndex == -1 {
		e.draft = append([]rune{}, e.line...)
		e.historyIndex = len(e.history) - 1
	} else if e.historyIndex > 0 {
		e.historyIndex--
	} else {
		return "\a"
	}
	e.line = []rune(e.history[e.historyIndex])
	e.cursor = len(e.line)
	return e.redraw()
}

func (e *directCLILineEditor) historyNext() string {
	if e.historyIndex == -1 {
		return "\a"
	}
	if e.historyIndex < len(e.history)-1 {
		e.historyIndex++
		e.line = []rune(e.history[e.historyIndex])
	} else {
		e.historyIndex = -1
		e.line = append([]rune{}, e.draft...)
		e.draft = nil
	}
	e.cursor = len(e.line)
	return e.redraw()
}

func (e *directCLILineEditor) completeToken() string {
	if len(e.completions) == 0 {
		return "\a"
	}
	start := e.cursor
	for start > 0 && !directCLIIsTokenBoundary(e.line[start-1]) {
		start--
	}
	prefix := string(e.line[start:e.cursor])
	if prefix == "" {
		return "\a"
	}
	var matches []string
	for _, word := range e.completions {
		if strings.HasPrefix(strings.ToLower(word), strings.ToLower(prefix)) {
			matches = append(matches, word)
		}
	}
	if len(matches) == 0 {
		return "\a"
	}
	if len(matches) == 1 {
		e.lastTabToken = ""
		return e.applyCompletion(prefix, matches[0])
	}

	common := longestCommonPrefixFold(matches)
	if len(common) > len(prefix) {
		e.lastTabToken = ""
		return e.applyCompletion(prefix, common)
	}
	tokenKey := strings.ToLower(prefix) + "\x00" + strings.Join(matches, "\x00")
	if e.lastTabToken != tokenKey {
		e.lastTabToken = tokenKey
		return "\a"
	}
	e.lastTabToken = ""
	return "\r\n" + formatDirectCLICompletionList(matches) + e.redraw()
}

func (e *directCLILineEditor) applyCompletion(prefix, completion string) string {
	if len(completion) <= len(prefix) {
		return "\a"
	}
	e.detachHistoryForEdit()
	add := []rune(completion[len(prefix):])
	e.line = append(append(append([]rune{}, e.line[:e.cursor]...), add...), e.line[e.cursor:]...)
	e.cursor += len(add)
	return e.redraw()
}

func (e *directCLILineEditor) handleEscape(seq string) string {
	switch seq {
	case "\x1b[A", "\x1bOA":
		return e.historyPrev()
	case "\x1b[B", "\x1bOB":
		return e.historyNext()
	case "\x1b[C", "\x1bOC":
		return e.moveRight()
	case "\x1b[D", "\x1bOD":
		return e.moveLeft()
	case "\x1b[H", "\x1b[1~", "\x1b[7~", "\x1bOH":
		return e.moveHome()
	case "\x1b[F", "\x1b[4~", "\x1b[8~", "\x1bOF":
		return e.moveEnd()
	case "\x1b[3~":
		return e.deleteAtCursor()
	default:
		return ""
	}
}

func (e *directCLILineEditor) redraw() string {
	var out strings.Builder
	out.WriteString("\x1b[2K\r")
	out.WriteString(e.prompt)
	out.WriteString(string(e.line))
	if back := len(e.line) - e.cursor; back > 0 {
		out.WriteString(strings.Repeat("\x1b[D", back))
	}
	return out.String()
}

func (e *directCLILineEditor) addHistory(line string) {
	line = strings.TrimSpace(line)
	if line == "" {
		return
	}
	if len(e.history) > 0 && e.history[len(e.history)-1] == line {
		return
	}
	e.history = append(e.history, line)
	if len(e.history) > 200 {
		e.history = e.history[len(e.history)-200:]
	}
}

func (e *directCLILineEditor) detachHistoryForEdit() {
	if e.historyIndex == -1 {
		return
	}
	e.historyIndex = -1
	e.draft = nil
}

func (e *directCLILineEditor) resetHistoryNavigation() {
	e.historyIndex = -1
	e.draft = nil
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

func directCLIEscapeComplete(seq []rune) bool {
	if len(seq) < 2 {
		return false
	}
	if len(seq) == 2 && seq[1] != '[' && seq[1] != 'O' {
		return true
	}
	last := seq[len(seq)-1]
	switch seq[1] {
	case '[':
		return (last >= 'A' && last <= 'Z') || (last >= 'a' && last <= 'z') || last == '~'
	case 'O':
		return len(seq) >= 3
	default:
		return true
	}
}

func directCLIIsTokenBoundary(r rune) bool {
	return r == ' ' || r == '\t' || r == ';' || r == '(' || r == ')'
}

func directCLICompletionWords(prompt string) []string {
	p := strings.ToLower(prompt)
	if strings.Contains(p, "redis") {
		return []string{
			"append", "auth", "client", "cluster", "config", "dbsize", "decr", "del", "exists", "expire",
			"get", "hdel", "hget", "hgetall", "hkeys", "hlen", "hmget", "hset", "incr", "info", "keys",
			"lindex", "llen", "lpop", "lpush", "lrange", "mget", "mset", "ping", "publish", "quit",
			"scan", "select", "set", "smembers", "srem", "ttl", "type", "zrange", "zrem",
		}
	}
	if strings.Contains(p, "mysql") {
		return []string{
			"alter", "begin", "commit", "create", "delete", "describe", "drop", "exit", "explain",
			"insert", "rollback", "select", "show", "truncate", "update", "use",
		}
	}
	return nil
}

func longestCommonPrefixFold(values []string) string {
	if len(values) == 0 {
		return ""
	}
	prefix := values[0]
	for _, value := range values[1:] {
		for len(prefix) > 0 && !strings.HasPrefix(strings.ToLower(value), strings.ToLower(prefix)) {
			prefix = prefix[:len(prefix)-1]
		}
		if prefix == "" {
			return ""
		}
	}
	return prefix
}

func formatDirectCLICompletionList(values []string) string {
	if len(values) == 0 {
		return ""
	}
	maxLen := 0
	for _, value := range values {
		if len(value) > maxLen {
			maxLen = len(value)
		}
	}
	colWidth := maxLen + 4
	cols := 4
	if colWidth > 24 {
		cols = 3
	}
	var b strings.Builder
	for i, value := range values {
		b.WriteString(value)
		if i == len(values)-1 || (i+1)%cols == 0 {
			b.WriteString("\r\n")
			continue
		}
		b.WriteString(strings.Repeat(" ", colWidth-len(value)))
	}
	return b.String()
}

func writeWebSocketTerminalText(conn *websocket.Conn, msg string) {
	if conn == nil || msg == "" {
		return
	}
	_ = conn.WriteMessage(websocket.TextMessage, []byte(msg))
}
