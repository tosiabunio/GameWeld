# GameWeld: single-command entry points for running work-in-progress builds on a Mac with OrbStack.
# See docs/running-locally.md and implementation plan Section 3.1.

APP_PORT ?= 8090
export APP_PORT
URL := http://localhost:$(APP_PORT)
TEST_DATABASE_URL ?= postgres://gameweld:gameweld@localhost:5433/gameweld_test

.PHONY: up down reset logs status test setup lint typecheck

## Build from source, start the app and database, migrate, seed if empty, print the URL.
up:
	@docker compose up -d --build --wait
	@echo
	@echo "GameWeld is running at $(URL)"

## Stop the containers. Data is kept.
down:
	@docker compose down

## Stop, delete the database and attachments, start fresh with seed data.
reset:
	@docker compose down -v
	@$(MAKE) up

## Follow application logs.
logs:
	@docker compose logs -f app

## Show whether the stack is running, the build time, and the migration version.
status:
	@docker compose ps
	@echo
	@curl -fsS $(URL)/api/health || echo "App is not responding at $(URL)"
	@echo

## Install JavaScript dependencies and the browser used by end-to-end tests.
setup: node_modules
	@npx playwright install chromium

node_modules: package.json package-lock.json
	@npm ci
	@touch node_modules

lint: node_modules
	@npm run lint

typecheck: node_modules
	@npm run typecheck

## Run unit, integration, and browser tests against a throwaway database.
test: setup
	@docker compose --profile test up -d --wait db-test
	@npm run build
	@status=0; \
	  npm run test:unit && \
	  TEST_DATABASE_URL=$(TEST_DATABASE_URL) npm run test:integration && \
	  TEST_DATABASE_URL=$(TEST_DATABASE_URL) npm run test:e2e || status=$$?; \
	  docker compose --profile test stop db-test >/dev/null; \
	  docker compose --profile test rm -f db-test >/dev/null; \
	  exit $$status
