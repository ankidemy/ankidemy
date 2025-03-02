.PHONY: up down restart build logs clean purge-volumes reset-db debug-up debug-server debug-client reset-db-confirm rebuild-server rebuild-client up-dev down-dev nuke

# ---------------------------------------
# PRODUCTION OPERATIONS - OPTIMIZED FOR SPEED
# ---------------------------------------
# Start all services with BuildKit cache (fast)
up:
	DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker compose up -d
# Start all services with fresh builds (slower but ensures latest)
up-build:
	DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker compose up -d --build
# Stop all services
down:
	docker compose down
# Restart all services (without rebuilding)
restart:
	docker compose restart
# View logs
logs:
	docker compose logs -f
# Targeted logs for a specific service
logs-%:
	docker compose logs -f $*
# ---------------------------------------
# DEVELOPMENT OPERATIONS
# ---------------------------------------
# Start services in development mode
up-dev:
	DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
# Start services in development mode with logs
up-dev-logs:
	DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker compose -f docker-compose.yml -f docker-compose.dev.yml up
# Stop services in development mode
down-dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml down
# Start specific service in development mode
dev-%:
	DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d $*
# Live reload for server development
dev-server-watch:
	DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
	DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker compose -f docker-compose.yml -f docker-compose.dev.yml up server
# Live reload for client development
dev-client-watch:
	DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker compose -f docker-compose.yml -f docker-compose.dev.yml up client
# ---------------------------------------
# DEBUGGING OPERATIONS
# ---------------------------------------
# Start with debug output enabled
debug-up:
	BUILDKIT_PROGRESS=plain DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker compose up -d --build
# Debug specific service (rebuild without cache)
debug-%:
	BUILDKIT_PROGRESS=plain docker compose build --no-cache $*
	docker compose up -d $*
# Rebuild server service (no cache)
rebuild-server:
	docker compose build --no-cache server
	docker compose up -d server
# Rebuild client service (no cache)
rebuild-client:
	docker compose build --no-cache client
	docker compose up -d client
# ---------------------------------------
# DATABASE OPERATIONS
# ---------------------------------------
# Ask for confirmation before resetting the database
reset-db:
	@echo "WARNING: This will delete all database data permanently."
	@echo "Type 'yes' to confirm: "
	@read confirmation; \
	if [ "$$confirmation" = "yes" ]; then \
		make reset-db-confirm; \
	else \
		echo "Operation canceled."; \
	fi
# Actually reset the database (called by reset-db after confirmation)
reset-db-confirm:
	docker compose down
	docker volume rm $$(docker volume ls -q | grep postgres_data) || true
	docker compose up -d db
	@echo "Database reset complete."
# ---------------------------------------
# CLEANUP OPERATIONS
# ---------------------------------------
# Clean up containers only
clean:
	docker compose down
# Clean up containers and images
clean-all:
	docker compose down
	docker rmi $$(docker images -q myapp-* 2>/dev/null) 2>/dev/null || true
	@echo "Removed all project containers and images."
# Clean up everything including volumes (DANGEROUS)
purge:
	@echo "WARNING: This will delete all containers, images, and volumes permanently."
	@echo "Type 'yes' to confirm: "
	@read confirmation; \
	if [ "$$confirmation" = "yes" ]; then \
		docker compose down -v; \
		docker rmi $$(docker images -q myapp-* 2>/dev/null) 2>/dev/null || true; \
		echo "Purge complete. All project resources have been removed."; \
	else \
		echo "Operation canceled."; \
	fi
# ---------------------------------------
# NUCLEAR OPTION - COMPLETELY RESET ENVIRONMENT
# ---------------------------------------
# Complete system cleanup with confirmation - removes ALL containers, images, volumes, networks, and build cache
nuke:
	@echo "⚠️  WARNING: NUCLEAR OPTION ⚠️"
	@echo "This will delete ALL Docker resources, including:"
	@echo "  - All containers (running or stopped)"
	@echo "  - All volumes and their data"
	@echo "  - All networks"
	@echo "  - All images"
	@echo "  - All build cache"
	@echo "  - All unused Docker objects"
	@echo "It will also clean the git repository to remove untracked files."
	@echo ""
	@echo "Type 'NUKE' (all caps) to confirm: "
	@read confirmation; \
	if [ "$$confirmation" = "NUKE" ]; then \
		echo "🧨 Beginning nuclear cleanup..."; \
		echo "Stopping all containers..."; \
		docker compose down -v; \
		echo "Removing all volumes..."; \
		docker volume prune -f; \
		echo "Removing all unused networks..."; \
		docker network prune -f; \
		echo "Removing all images..."; \
		docker rmi $$(docker images -q) -f 2>/dev/null || true; \
		echo "Cleaning BuildKit cache..."; \
		sudo docker builder prune -f -a; \
		echo "Pruning entire Docker system..."; \
		sudo docker system prune -a -f --volumes; \
		echo "Cleaning git repository..."; \
		git clean -fdx; \
		echo ""; \
		echo "☢️  Nuclear cleanup complete. Your system has been reset. ☢️"; \
		echo "Run 'make setup' to recreate project directory structure if needed."; \
	else \
		echo "Nuclear operation canceled. Your system is safe."; \
	fi
# ---------------------------------------
# UTILITY OPERATIONS
# ---------------------------------------
# Show container status
status:
	docker compose ps
# Show container resource usage
stats:
	docker stats $$(docker compose ps -q)
# Create project directory structure (if needed)
setup:
	mkdir -p db/init-scripts
	mkdir -p server
	mkdir -p client
