FRONTEND_DIR = ./web
BACKEND_DIR = ./api

.PHONY: all build-frontend build-backend start-frontend start-backend test lint

all: start-backend

build-frontend:
	@echo "Building frontend..."
	@cd $(FRONTEND_DIR) && npm ci && npm run build

build-backend:
	@echo "Building backend..."
	@cd $(BACKEND_DIR) && go build -o kube-bt-sync .

start-frontend:
	@echo "Starting frontend dev server..."
	@cd $(FRONTEND_DIR) && npm run dev

start-backend:
	@echo "Starting backend dev server..."
	@cd $(BACKEND_DIR) && go run .

test:
	@cd $(BACKEND_DIR) && go test . ./cmd/... ./internal

lint:
	@cd $(FRONTEND_DIR) && npm run lint
