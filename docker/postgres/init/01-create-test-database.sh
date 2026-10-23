#!/bin/sh
# Runs once, on first start of an empty volume. Integration tests use a separate
# database so they can reset it without touching development data.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -c "CREATE DATABASE \"${POSTGRES_DB}_test\" OWNER \"$POSTGRES_USER\";"
