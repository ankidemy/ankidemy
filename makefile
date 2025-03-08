# Development Commands

# Start development environment
up-dev:
	DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Start development environment with logs
up-dev-logs:
	DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# Stop development environment
down-dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml down

# Show container status
status:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml ps

# View all logs
logs:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f

# View server logs
server-logs:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f server

# View client logs
client-logs:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f client

# Restart server
restart-server:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml restart server

# Restart client
restart-client:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml restart client

# Clean up resources
clean:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml down
	docker volume prune -f
