.PHONY: dev stop backend frontend test test-backend test-frontend

stop:
	@kill $$(cat /tmp/bsi-backend.pid 2>/dev/null) $$(cat /tmp/bsi-frontend.pid 2>/dev/null) 2>/dev/null || true
	@lsof -ti :8000 | xargs kill -9 2>/dev/null || true
	@lsof -ti :5173 | xargs kill -9 2>/dev/null || true
	@echo "Stopped."

dev: stop
	@source backend/.venv/bin/activate && cd backend && uvicorn main:app --reload > /tmp/bsi-backend.log 2>&1 & echo $$! > /tmp/bsi-backend.pid
	@cd frontend && npm run dev > /tmp/bsi-frontend.log 2>&1 & echo $$! > /tmp/bsi-frontend.pid
	@echo "Backend:  http://127.0.0.1:8000"
	@echo "Frontend: http://localhost:5173"
	@trap 'kill $$(cat /tmp/bsi-backend.pid) $$(cat /tmp/bsi-frontend.pid) 2>/dev/null' EXIT INT; tail -f /tmp/bsi-backend.log /tmp/bsi-frontend.log

backend:
	@source backend/.venv/bin/activate && cd backend && uvicorn main:app --reload

frontend:
	@cd frontend && npm run dev

test: test-backend test-frontend

test-backend:
	@source backend/.venv/bin/activate && cd backend && pytest

test-frontend:
	@cd frontend && npm test -- --run
