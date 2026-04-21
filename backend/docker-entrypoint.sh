#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy

echo "Running seed (skips if data exists)..."
node prisma/seed-prod.js

echo "Starting application..."
exec node dist/src/main.js
