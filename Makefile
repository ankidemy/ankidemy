# Development and Production Commands
.PHONY: dev prod prod-build down logs clean purge nuke wipe-db

# Start development environment with logs (without -d)
dev:
	DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# Start production environment with logs (without -d)
prod:
	DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker compose -f docker-compose.yml -f docker-compose.prod.yml up

# Build and start production environment
prod-build:
	DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build

# Build and start dev environment
dev-build:
	DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Stop all services (dev or prod)
down:
	docker compose down

# View logs for all services
logs:
	docker compose logs -f

# Clean up containers and volumes
clean:
	docker compose down
	docker volume prune -f

# Remove project images
purge:
	docker compose down
	docker rmi $$(docker images -q myapp-* 2>/dev/null) 2>/dev/null || true
	@echo "Removed all project containers and images."

# Complete system reset
nuke:
	@echo "⚠️  WARNING: This will completely reset your Docker environment ⚠️"
	@echo "Type 'NUKE' (all caps) to confirm: "
	@read confirmation; \
	if [ "$$confirmation" = "NUKE" ]; then \
		echo "Stopping all containers..."; \
		docker compose down; \
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
		docker compose -f docker-compose.yml -f docker-compose.dev.yml down; \
		docker volume rm $$(docker volume ls -q | grep postgres_data) || true; \
		echo "Database reset complete."; \
	else \
		echo "Operation canceled."; \
	fi
