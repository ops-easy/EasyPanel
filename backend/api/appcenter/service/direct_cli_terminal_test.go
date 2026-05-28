package service

import (
	"strings"
	"testing"
)

func TestDirectCLILineEditorHistoryAndArrowKeys(t *testing.T) {
	editor := newDirectCLILineEditor("redis> ")
	out, lines, close := editor.feedString("ping\r\x1b[A\r")
	if close {
		t.Fatalf("editor closed unexpectedly")
	}
	if got, want := strings.Join(lines, ","), "ping,ping"; got != want {
		t.Fatalf("completed lines=%q, want %q", got, want)
	}
	if !strings.Contains(out, "\x1b[2K\rredis> ping") {
		t.Fatalf("up arrow should redraw previous command, output=%q", out)
	}
}

func TestDirectCLILineEditorSupportsCursorEditing(t *testing.T) {
	editor := newDirectCLILineEditor("mysql> ")
	_, lines, _ := editor.feedString("selct\x1b[D\x1b[De\r")
	if len(lines) != 1 || lines[0] != "select" {
		t.Fatalf("completed lines=%#v, want [select]", lines)
	}
}

func TestDirectCLILineEditorSupportsControlShortcuts(t *testing.T) {
	editor := newDirectCLILineEditor("mysql> ")
	out, lines, _ := editor.feedString("world\x01hello \x05!\rabc\x15def\x01\x0bghi\x0c\r")
	if got, want := strings.Join(lines, ","), "hello world!,ghi"; got != want {
		t.Fatalf("completed lines=%q, want %q", got, want)
	}
	if !strings.Contains(out, "\x1b[2J\x1b[H") {
		t.Fatalf("ctrl-l should clear screen, output=%q", out)
	}
}

func TestDirectCLILineEditorTabCompletesUniqueCommand(t *testing.T) {
	editor := newDirectCLILineEditor("redis> ")
	_, lines, _ := editor.feedString("pin\t\r")
	if len(lines) != 1 || lines[0] != "ping" {
		t.Fatalf("completed lines=%#v, want [ping]", lines)
	}
}

func TestDirectCLILineEditorTabCompletesCommonPrefixAndListsMatches(t *testing.T) {
	editor := newDirectCLILineEditor("redis> ")
	out, lines, _ := editor.feedString("h\t\t\r")
	if len(lines) != 1 || lines[0] != "h" {
		t.Fatalf("completed lines=%#v, want [h]", lines)
	}
	for _, want := range []string{"hdel", "hget", "hgetall", "hkeys", "hmget", "hset"} {
		if !strings.Contains(out, want) {
			t.Fatalf("second tab should list %q, output=%q", want, out)
		}
	}
	if !strings.Contains(out, "\r\n") {
		t.Fatalf("second tab should list matching commands, output=%q", out)
	}
	if !strings.Contains(out, "\x1b[2K\rredis> h") {
		t.Fatalf("completion list should redraw prompt, output=%q", out)
	}
}
