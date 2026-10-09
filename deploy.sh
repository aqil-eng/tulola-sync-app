#!/bin/bash
set -e

# Build and push the Docker image. The VPS side lives in the
# tulola-integration repo (docker-compose.yml), which runs the whole stack.
#
# Usage: ./deploy.sh <version>   e.g. ./deploy.sh 1.0.0
IMAGE_NAME="heyrcg/tulola-sync-app"
TAG="${1:?Usage: ./deploy.sh <version>}"

echo "Building and pushing $IMAGE_NAME:$TAG (linux/amd64)..."
docker buildx build --platform linux/amd64 -t "$IMAGE_NAME:$TAG" --push .

echo "Image pushed successfully!"
echo "On the VPS: set SYNC_APP_VERSION=$TAG in .env, then run"
echo "docker compose pull sync-app && docker compose up -d sync-app"
