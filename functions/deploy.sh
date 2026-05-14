#!/bin/bash
# Deploy Cloud Functions to GCP
# Usage: ./deploy.sh [function-name] [--dry-run]

set -e

PROJECT_ID="${GCP_PROJECT_ID:-viralcue-prod}"
REGION="${GCP_REGION:-us-central1}"
DRY_RUN=false

# Parse arguments
FUNCTION_NAME=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        *)
            FUNCTION_NAME="$1"
            shift
            ;;
    esac
done

deploy_function() {
    local name=$1
    local trigger_topic=$2
    local entry_point=$3
    
    echo "Deploying function: $name"
    echo "  Trigger topic: $trigger_topic"
    echo "  Entry point: $entry_point"
    
    if [ "$DRY_RUN" = true ]; then
        echo "  [DRY RUN] Would deploy $name"
        return
    fi
    
    cd "$(dirname "$0")/../$name"
    
    gcloud functions deploy "$name" \
        --gen2 \
        --runtime python311 \
        --region "$REGION" \
        --source . \
        --entry-point "$entry_point" \
        --trigger-topic "$trigger_topic" \
        --set-env-vars GCP_PROJECT_ID="$PROJECT_ID" \
        --memory 256MB \
        --timeout 60s \
        --max-instances 10
    
    echo "  ✅ Deployed $name"
}

echo "=== ViralCue Cloud Functions Deployment ==="
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo ""

# Deploy specific function or all
if [ -n "$FUNCTION_NAME" ]; then
    case $FUNCTION_NAME in
        affiliate-trigger)
            deploy_function "affiliate-trigger" "viralcue-affiliate-trigger" "affiliate_trigger"
            ;;
        publisher-webhook)
            deploy_function "publisher-webhook" "viralcue-card-approved" "publisher_webhook"
            ;;
        *)
            echo "Unknown function: $FUNCTION_NAME"
            echo "Available: affiliate-trigger, publisher-webhook"
            exit 1
            ;;
    esac
else
    # Deploy all functions
    deploy_function "affiliate-trigger" "viralcue-affiliate-trigger" "affiliate_trigger"
    deploy_function "publisher-webhook" "viralcue-card-approved" "publisher_webhook"
fi

echo ""
echo "=== Deployment Complete ==="
