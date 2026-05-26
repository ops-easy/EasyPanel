package mysql

import "testing"

func TestComposeDSN(t *testing.T) {
	got := ComposeDSN(" db.local ", 3306, " easypanel ", "p@ss:word", " kube_bt ")
	want := "easypanel:p%40ss%3Aword@tcp(db.local:3306)/kube_bt?parseTime=true&charset=utf8mb4"
	if got != want {
		t.Fatalf("ComposeDSN() = %q, want %q", got, want)
	}
}

func TestComposeDSNWithoutPassword(t *testing.T) {
	got := ComposeDSN("::1", 3306, "root", "", "easypanel")
	want := "root@tcp([::1]:3306)/easypanel?parseTime=true&charset=utf8mb4"
	if got != want {
		t.Fatalf("ComposeDSN() = %q, want %q", got, want)
	}
}
