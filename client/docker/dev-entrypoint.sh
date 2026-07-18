#!/bin/sh
set -eu

checksum_file=node_modules/.ankidemy-dependencies.md5sum

# node_modules is a persistent volume. npm ci is only needed for a new volume
# or when one of the dependency inputs changes.
if [ ! -x node_modules/.bin/next ] || [ ! -f "$checksum_file" ] || ! md5sum -c "$checksum_file" >/dev/null 2>&1; then
    echo 'Client dependencies changed, installing...'
    npm ci
    md5sum package.json package-lock.json .npmrc > "$checksum_file"
fi

exec npm run dev
