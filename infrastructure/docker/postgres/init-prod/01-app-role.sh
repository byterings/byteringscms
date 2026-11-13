#!/bin/sh
# Production database bootstrap: creates the application role (no superuser,
# no BYPASSRLS, so row-level security applies) and its database. Runs once,
# when the data volume is first initialized.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE ${APP_DB_USER} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB PASSWORD '${APP_DB_PASSWORD}';
CREATE DATABASE byterings OWNER ${APP_DB_USER} ENCODING 'UTF8';
SQL
