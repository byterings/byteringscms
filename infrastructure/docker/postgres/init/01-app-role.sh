#!/bin/sh
# Creates the application role (not a superuser, no BYPASSRLS, so row-level
# security applies) and the development/test databases. Runs once, when the
# data volume is first initialized.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE ${APP_DB_USER} LOGIN CREATEDB NOSUPERUSER NOBYPASSRLS PASSWORD '${APP_DB_PASSWORD}';
CREATE DATABASE byterings_dev OWNER ${APP_DB_USER} ENCODING 'UTF8';
CREATE DATABASE byterings_test OWNER ${APP_DB_USER} ENCODING 'UTF8';
CREATE DATABASE byterings_shadow OWNER ${APP_DB_USER} ENCODING 'UTF8';
SQL
