# nginx/Dockerfile
FROM nginx:alpine

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Create required directories and set permissions
RUN mkdir -p /var/cache/nginx /var/run/nginx && \
    chown -R nginx:nginx /var/cache/nginx /var/run/nginx /etc/nginx/conf.d /var/log/nginx && \
    chmod -R 755 /var/cache/nginx /var/run/nginx

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/health || exit 1

# We will not use USER nginx here because the nginx:alpine image 
# has an entrypoint script that needs to run as root
# Instead, we'll modify the nginx.conf to drop privileges after startup
