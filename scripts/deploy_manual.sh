#!/bin/bash
set -e

# Configuration
ACR_NAME="threadsmonitoracr"
RESOURCE_GROUP="john-threads"
ENVIRONMENT="threads-monitor-env-sg"
REGISTRY_URL="${ACR_NAME}.azurecr.io"

echo "🚀 Starting manual deployment to Azure..."

# 1. Login to ACR (using the credentials we retrieved)
echo "🔑 Logging into ACR..."
docker login $REGISTRY_URL -u threadsmonitoracr -p NMH2V6nGVse4ngYzuVQJWC5ITzF0DMHynh2Z2orksvviNo0jE4nDJQQJ99CBAC3pKaREqg7NAAACAZCRpc8R

# 2. Build Images with unique tags
TAG=$(date +%Y%m%d%H%M%S)
echo "🏗️ Building images with tag: $TAG..."

echo "🏗️ Building Web Image..."
docker build -t $REGISTRY_URL/threads-monitor-web:$TAG -t $REGISTRY_URL/threads-monitor-web:latest .

echo "🏗️ Building Worker Image..."
docker build -f Dockerfile.worker -t $REGISTRY_URL/threads-monitor-worker:$TAG -t $REGISTRY_URL/threads-monitor-worker:latest .

# 4. Push Images
echo "📤 Pushing images to ACR..."
docker push $REGISTRY_URL/threads-monitor-web:$TAG
docker push $REGISTRY_URL/threads-monitor-web:latest
docker push $REGISTRY_URL/threads-monitor-worker:$TAG
docker push $REGISTRY_URL/threads-monitor-worker:latest

# 5. Configure Registry Credentials & Update Container Apps
echo "🔄 Configuring Registry and Updating Container Apps..."

AZ_RUN="docker run --rm -v /home/jlino/dev/threads-monitor/.azure_config:/root/.azure mcr.microsoft.com/azure-cli az"
ACR_PASS="NMH2V6nGVse4ngYzuVQJWC5ITzF0DMHynh2Z2orksvviNo0jE4nDJQQJ99CBAC3pKaREqg7NAAACAZCRpc8R"

# Function to configure and update
update_app() {
    local app_name=$1
    local image_url=$2
    echo "Updating $app_name..."
    # Set registry
    $AZ_RUN containerapp registry set --name $app_name --resource-group $RESOURCE_GROUP --server $REGISTRY_URL --username $ACR_NAME --password $ACR_PASS
    # Update image
    $AZ_RUN containerapp update --name $app_name --resource-group $RESOURCE_GROUP --image $image_url
}

# Update Web
update_app "web-sg" "$REGISTRY_URL/threads-monitor-web:$TAG"

# Update Workers
for worker in scraper heartbeat youtube metrics; do
    update_app "worker-$worker-sg" "$REGISTRY_URL/threads-monitor-worker:$TAG"
done

echo "✅ Deployment complete!"
echo "Check your app at: https://web-sg.livelystone-27859f5b.southeastasia.azurecontainerapps.io"
