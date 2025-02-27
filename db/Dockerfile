FROM postgres:alpine

# Custom initialization scripts can be added here
COPY ./init-scripts/ /docker-entrypoint-initdb.d/

# Set health check parameters
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB} || exit 1
