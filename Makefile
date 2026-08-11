# Detect which docker compose command is available
DOCKER_COMPOSE := $(shell if command -v docker-compose >/dev/null 2>&1; then echo "docker-compose"; else echo "docker compose"; fi)
DEV_PROJECT_NAME ?= ankidemy
PROD_PROJECT_NAME ?= ankidemy-prod
# Hosts may supply an additional Compose file for private network topology
DEV_COMPOSE := $(DOCKER_COMPOSE) --project-name $(DEV_PROJECT_NAME) -f docker-compose.yml -f docker-compose.dev.yml $(if $(strip $(ANKIDEMY_DEV_COMPOSE_OVERRIDE)),-f "$(ANKIDEMY_DEV_COMPOSE_OVERRIDE)",)
PROD_COMPOSE := $(DOCKER_COMPOSE) --project-name $(PROD_PROJECT_NAME) -f docker-compose.yml -f docker-compose.prod.yml
# Teardown commands must enable every profile so optional services (for example,
# pgAdmin in the "tools" profile) are stopped before Compose removes networks.
DEV_COMPOSE_ALL_PROFILES := $(DEV_COMPOSE) --profile "*"
PROD_COMPOSE_ALL_PROFILES := $(PROD_COMPOSE) --profile "*"

# Development and Production Commands
.PHONY: setup-env dev prod prod-build dev-build down dev-down prod-down logs prod-logs clean purge nuke wipe-db test-org-authoring

# Bootstrap local-only development settings without committing credentials.
# Existing .env files are intentionally never overwritten.
.env:
	@install -m 600 .env.example .env
	@echo "Created .env from .env.example; edit it to customize local settings."

setup-env: .env

test-org-authoring:
	python3 -m unittest -v integrations/emacs/tests/test_ankidemy_org_tool.py
	emacs --batch -Q -L integrations/emacs -L integrations/emacs/tests \
		-l ankidemy-org-import-test.el -f ert-run-tests-batch-and-exit

# Start development environment with logs (without -d)
dev: setup-env
	DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 $(DEV_COMPOSE) up

# Start production environment with logs (without -d)
prod:
	DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 $(PROD_COMPOSE) up

# Build and start production environment
prod-build:
	DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 $(PROD_COMPOSE) up --build

# Build and start dev environment
dev-build: setup-env
	DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 $(DEV_COMPOSE) up --build

# Stop both environments without deleting their data volumes
down:
	$(DEV_COMPOSE_ALL_PROFILES) down --remove-orphans
	$(PROD_COMPOSE_ALL_PROFILES) down --remove-orphans

dev-down:
	$(DEV_COMPOSE_ALL_PROFILES) down --remove-orphans

prod-down:
	$(PROD_COMPOSE_ALL_PROFILES) down --remove-orphans

# View logs for all services
logs:
	$(DEV_COMPOSE) logs -f

prod-logs:
	$(PROD_COMPOSE) logs -f

# Remove project containers and their volumes (including database data)
clean:
	$(DEV_COMPOSE_ALL_PROFILES) down --volumes --remove-orphans
	$(PROD_COMPOSE_ALL_PROFILES) down --volumes --remove-orphans

# Remove project images
purge:
	$(DEV_COMPOSE_ALL_PROFILES) down --remove-orphans
	$(PROD_COMPOSE_ALL_PROFILES) down --remove-orphans
	docker image rm ankidemy-server:development ankidemy-client:development \
		ankidemy-server:production ankidemy-client:production 2>/dev/null || true
	@echo "Removed all project containers and images."

# Complete system reset
nuke:
	@echo "⚠️  WARNING: This will completely reset your Docker environment ⚠️"
	@echo "Type 'NUKE' (all caps) to confirm: "
	@read confirmation; \
	if [ "$$confirmation" = "NUKE" ]; then \
		echo "Stopping all containers..."; \
		$(DEV_COMPOSE_ALL_PROFILES) down --remove-orphans; \
		$(PROD_COMPOSE_ALL_PROFILES) down --remove-orphans; \
		echo "Stopping Docker service..."; \
		sudo systemctl stop docker; \
		echo "Starting Docker service..."; \
		sudo systemctl start docker; \
		echo "Pruning entire Docker system..."; \
		docker system prune -a --volumes -f; \
		echo "Cleaning git repository..."; \
		sudo git clean -fdx; \
		echo "Nuclear cleanup complete."; \
	else \
		echo "Operation canceled."; \
	fi

# Wipe development database
wipe-db:
	@echo "This will delete all database data in the development environment."
	@echo "Type 'yes' to confirm: "
	@read confirmation; \
	if [ "$$confirmation" = "yes" ]; then \
		$(DEV_COMPOSE_ALL_PROFILES) down; \
		docker volume rm $$(docker volume ls -q \
			--filter label=com.docker.compose.project=$(DEV_PROJECT_NAME) \
			--filter label=com.docker.compose.volume=postgres_data) || true; \
		echo "Database reset complete."; \
	else \
		echo "Operation canceled."; \
	fi
