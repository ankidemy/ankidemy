#!/bin/sh
set -eu

state_dir=/var/lib/ankidemy-dev
checksum_file="$state_dir/go-dependencies.md5sum"

mkdir -p "$state_dir"

# The module and build caches are persistent volumes. Only prefetch modules
# when either dependency manifest changes or the state volume is new.
if [ ! -f "$checksum_file" ] || ! md5sum -c "$checksum_file" >/dev/null 2>&1; then
    echo 'Go dependencies changed, downloading...'
    go mod download
    md5sum go.mod go.sum > "$checksum_file.tmp"
    mv "$checksum_file.tmp" "$checksum_file"
fi

exec air
