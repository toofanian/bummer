.PHONY: dev stop backend frontend test test-backend test-frontend test-e2e lint lint-fix venv-rebuild

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
	@sleep 4
	@ok=1; \
	if ! curl -sf -o /dev/null -m 2 http://127.0.0.1:8000/openapi.json; then \
		echo "FAIL: Backend not responding on :8000. Last 30 log lines:"; \
		tail -n 30 /tmp/bsi-backend.log; ok=0; \
	else echo "OK: Backend up: http://127.0.0.1:8000"; fi; \
	if ! lsof -ti :5173 >/dev/null 2>&1; then \
		echo "FAIL: Frontend not listening on :5173. Last 30 log lines:"; \
		tail -n 30 /tmp/bsi-frontend.log; ok=0; \
	else echo "OK: Frontend up: http://localhost:5173"; fi; \
	echo "Logs: /tmp/bsi-backend.log, /tmp/bsi-frontend.log"; \
	[ $$ok -eq 1 ]

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

# Rebuild backend venv from scratch. Run from main repo (not worktree).
venv-rebuild:
	@if [ -L backend/.venv ]; then echo "backend/.venv is a symlink — refusing to rebuild. Run from main repo."; exit 1; fi
	@rm -rf backend/.venv
	@/opt/homebrew/bin/python3.12 -m venv backend/.venv
	@backend/.venv/bin/pip install --upgrade pip
	@backend/.venv/bin/pip install -r backend/requirements.txt
	@echo "venv rebuilt at backend/.venv"
