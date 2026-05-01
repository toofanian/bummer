.PHONY: dev stop backend frontend test test-backend test-frontend test-e2e lint lint-fix

stop:
	@kill $$(cat /tmp/bsi-backend.pid 2>/dev/null) $$(cat /tmp/bsi-frontend.pid 2>/dev/null) 2>/dev/null || true
	@lsof -ti :8000 | xargs kill -9 2>/dev/null || true
	@lsof -ti :5173 | xargs kill -9 2>/dev/null || true
	@echo "Stopped."

dev: stop _ensure-env
	@source backend/.venv/bin/activate && cd backend && uvicorn main:app --reload > /tmp/bsi-backend.log 2>&1 & echo $$! > /tmp/bsi-backend.pid
	@cd frontend && npm run dev > /tmp/bsi-frontend.log 2>&1 & echo $$! > /tmp/bsi-frontend.pid
	@echo "Backend:  http://127.0.0.1:8000"
	@echo "Frontend: http://localhost:5173"
	@trap 'kill $$(cat /tmp/bsi-backend.pid) $$(cat /tmp/bsi-frontend.pid) 2>/dev/null' EXIT INT; tail -f /tmp/bsi-backend.log /tmp/bsi-frontend.log

# Non-blocking variant for agents — starts servers and returns immediately
dev-bg: stop _ensure-env
	@source backend/.venv/bin/activate && cd backend && uvicorn main:app --reload > /tmp/bsi-backend.log 2>&1 & echo $$! > /tmp/bsi-backend.pid
	@cd frontend && npm run dev > /tmp/bsi-frontend.log 2>&1 & echo $$! > /tmp/bsi-frontend.pid
	@sleep 2
	@echo "Backend:  http://127.0.0.1:8000"
	@echo "Frontend: http://localhost:5173"
	@echo "Logs: /tmp/bsi-backend.log, /tmp/bsi-frontend.log"

# Ensure .env and .venv exist (symlink from main repo when running in a worktree)
_ensure-env:
	@if [ ! -f backend/.env ] && [ -f "$(MAIN_REPO)/backend/.env" ]; then \
		ln -s "$(MAIN_REPO)/backend/.env" backend/.env; \
		echo "Symlinked backend/.env from main repo"; \
	fi
	@if [ ! -d backend/.venv ] && [ -d "$(MAIN_REPO)/backend/.venv" ]; then \
		ln -s "$(MAIN_REPO)/backend/.venv" backend/.venv; \
		echo "Symlinked backend/.venv from main repo"; \
	fi

backend:
	@source backend/.venv/bin/activate && cd backend && uvicorn main:app --reload

frontend:
	@cd frontend && npm run dev

test: test-backend test-frontend

test-backend:
	@source backend/.venv/bin/activate && cd backend && pytest

test-frontend:
	@cd frontend && npm test -- --run

test-e2e:
	@cd frontend && npm run test:e2e

lint:
	@source backend/.venv/bin/activate && cd backend && ruff check . && ruff format --check .

lint-fix:
	@source backend/.venv/bin/activate && cd backend && ruff check --fix . && ruff format .
