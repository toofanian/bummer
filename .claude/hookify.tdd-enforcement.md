---
name: tdd-enforcement
enabled: true
event: stop
action: block
conditions:
  - field: transcript
    operator: not_contains
    pattern: pytest|npm test|npm run test
---

**Tests not detected in this session!**

TDD is strictly enforced on this project. Before finishing:

- Did you write a **failing test first** before implementing?
- Did you run the tests and confirm they pass?

Run the relevant test suite:
- Backend: `cd backend && pytest`
- Frontend unit tests: `cd frontend && npm test -- --run`
- Frontend E2E: `cd frontend && npm run test:e2e`

If you only changed config files, docs, or CSS — you can disable this check by noting that no testable code was changed.
