#!/bin/bash

# Health Monitoring Script for Railway Deployment
# This script checks the health of both API and Web-App services

set -e

# Configuration
API_URL="${API_URL:-}"
WEBAPP_URL="${WEBAPP_URL:-}"
TIMEOUT=10
RETRY_COUNT=3
ALERT_WEBHOOK="${ALERT_WEBHOOK:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Health check function
check_health() {
    local service_name=$1
    local url=$2
    local endpoint=$3
    
    log "Checking $service_name health..."
    
    for i in $(seq 1 $RETRY_COUNT); do
        if curl -f -s --max-time $TIMEOUT "$url$endpoint" > /dev/null; then
            echo -e "${GREEN}✅ $service_name is healthy${NC}"
            return 0
        else
            if [ $i -lt $RETRY_COUNT ]; then
                log "⚠️  $service_name health check failed (attempt $i/$RETRY_COUNT), retrying..."
                sleep 2
            fi
        fi
    done
    
    echo -e "${RED}❌ $service_name is unhealthy${NC}"
    return 1
}

# Detailed health check function
check_detailed_health() {
    local service_name=$1
    local url=$2
    local endpoint=$3
    
    log "Getting detailed health status for $service_name..."
    
    local response=$(curl -f -s --max-time $TIMEOUT "$url$endpoint" 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
        return 0
    else
        echo -e "${RED}❌ Failed to get detailed health status for $service_name${NC}"
        return 1
    fi
}

# Send alert function
send_alert() {
    local message=$1
    
    if [ -n "$ALERT_WEBHOOK" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"🚨 Meetily Health Alert: $message\"}" \
            "$ALERT_WEBHOOK" 2>/dev/null || true
    fi
}

# Main monitoring function
main() {
    log "🔍 Starting health monitoring check..."
    
    local api_healthy=true
    local webapp_healthy=true
    
    # Check if URLs are provided
    if [ -z "$API_URL" ] || [ -z "$WEBAPP_URL" ]; then
        echo -e "${YELLOW}⚠️  Service URLs not provided. Please set API_URL and WEBAPP_URL environment variables.${NC}"
        echo "Usage: API_URL=https://your-api.railway.app WEBAPP_URL=https://your-webapp.railway.app $0"
        exit 1
    fi
    
    # Check API service
    if ! check_health "API Service" "$API_URL" "/health/live"; then
        api_healthy=false
        send_alert "API Service is unhealthy at $API_URL"
    fi
    
    # Check Web-App service
    if ! check_health "Web-App Service" "$WEBAPP_URL" "/api/health/ready"; then
        webapp_healthy=false
        send_alert "Web-App Service is unhealthy at $WEBAPP_URL"
    fi
    
    # Detailed health checks if basic checks pass
    if [ "$api_healthy" = true ]; then
        echo ""
        log "📊 API Service detailed health status:"
        check_detailed_health "API Service" "$API_URL" "/health"
    fi
    
    if [ "$webapp_healthy" = true ]; then
        echo ""
        log "📊 Web-App Service detailed health status:"
        check_detailed_health "Web-App Service" "$WEBAPP_URL" "/api/health"
    fi
    
    # Summary
    echo ""
    log "📋 Health Check Summary:"
    
    if [ "$api_healthy" = true ]; then
        echo -e "   API Service: ${GREEN}✅ Healthy${NC}"
    else
        echo -e "   API Service: ${RED}❌ Unhealthy${NC}"
    fi
    
    if [ "$webapp_healthy" = true ]; then
        echo -e "   Web-App Service: ${GREEN}✅ Healthy${NC}"
    else
        echo -e "   Web-App Service: ${RED}❌ Unhealthy${NC}"
    fi
    
    # Exit with error if any service is unhealthy
    if [ "$api_healthy" = false ] || [ "$webapp_healthy" = false ]; then
        log "❌ One or more services are unhealthy"
        exit 1
    else
        log "✅ All services are healthy"
        exit 0
    fi
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Monitor health of Meetily services deployed on Railway.app"
        echo ""
        echo "Environment Variables:"
        echo "  API_URL        URL of the API service (required)"
        echo "  WEBAPP_URL     URL of the web-app service (required)"
        echo "  ALERT_WEBHOOK  Webhook URL for alerts (optional)"
        echo ""
        echo "Options:"
        echo "  --help, -h     Show this help message"
        echo "  --api-only     Check only API service health"
        echo "  --webapp-only  Check only Web-App service health"
        echo "  --detailed     Show detailed health information"
        echo ""
        echo "Examples:"
        echo "  API_URL=https://api.railway.app WEBAPP_URL=https://app.railway.app $0"
        echo "  $0 --api-only"
        echo "  $0 --detailed"
        exit 0
        ;;
    --api-only)
        if [ -z "$API_URL" ]; then
            echo -e "${RED}❌ API_URL environment variable is required${NC}"
            exit 1
        fi
        log "🔍 Checking API service only..."
        check_health "API Service" "$API_URL" "/health/live"
        check_detailed_health "API Service" "$API_URL" "/health"
        ;;
    --webapp-only)
        if [ -z "$WEBAPP_URL" ]; then
            echo -e "${RED}❌ WEBAPP_URL environment variable is required${NC}"
            exit 1
        fi
        log "🔍 Checking Web-App service only..."
        check_health "Web-App Service" "$WEBAPP_URL" "/api/health/ready"
        check_detailed_health "Web-App Service" "$WEBAPP_URL" "/api/health"
        ;;
    --detailed)
        main
        ;;
    "")
        main
        ;;
    *)
        echo "❌ Unknown option: $1"
        echo "Use --help for usage information"
        exit 1
        ;;
esac