package mysql

import "testing"

func TestComposeDSN(t *testing.T) {
	got := ComposeDSN(" db.local ", 3306, " kubebt ", "p@ss:word", " kube_bt ")
	want := "kubebt:p%40ss%3Aword@tcp(db.local:3306)/kube_bt?parseTime=true&charset=utf8mb4"
	if got != want {
		t.Fatalf("ComposeDSN() = %q, want %q", got, want)
	}
}

func TestComposeDSNWithoutPassword(t *testing.T) {
	got := ComposeDSN("::1", 3306, "root", "", "kubebt")
	want := "root@tcp([::1]:3306)/kubebt?parseTime=true&charset=utf8mb4"
	if got != want {
		t.Fatalf("ComposeDSN() = %q, want %q", got, want)
	}
}
