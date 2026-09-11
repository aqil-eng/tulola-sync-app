#!/bin/bash

# Build and push Docker image
IMAGE_NAME="heyrcg/tulola-sync-app"
TAG="latest"

echo "Building Docker image..."
docker build -t $IMAGE_NAME:$TAG .

echo "Pushing to Docker Hub..."
docker push $IMAGE_NAME:$TAG

echo "Image pushed successfully!"
echo "Now run this on your VPS:"
echo "docker-compose -f docker-compose.prod.yml pull && docker-compose -f docker-compose.prod.yml up -d"
