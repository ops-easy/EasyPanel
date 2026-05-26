FRONTEND_DIR = ./frontend
BACKEND_DIR = ./backend

.PHONY: all build-frontend build-backend start-frontend start-backend test lint

all: start-backend

build-frontend:
	@echo "Building frontend..."
	@cd $(FRONTEND_DIR) && npm ci && npm run build

build-backend:
	@echo "Building backend..."
	@cd $(BACKEND_DIR) && go build -o easypanel .

start-frontend:
	@echo "Starting frontend dev server..."
	@cd $(FRONTEND_DIR) && npm run dev

start-backend:
	@echo "Starting backend dev server..."
	@cd $(BACKEND_DIR) && go run .

test:
	@cd $(BACKEND_DIR) && go test ./...

lint:
	@cd $(FRONTEND_DIR) && npm run lint
