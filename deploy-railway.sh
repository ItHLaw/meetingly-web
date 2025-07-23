#!/bin/bash

# Deploy to Railway.app
set -e

echo "🚀 Starting Railway.app deployment..."

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI is not installed. Please install it first:"
    echo "npm install -g @railway/cli"
    exit 1
fi

# Check if logged in to Railway
if ! railway whoami &> /dev/null; then
    echo "❌ Not logged in to Railway. Please login first:"
    echo "railway login"
    exit 1
fi

# Function to check if service exists
check_service() {
    local service_name=$1
    if railway status --service "$service_name" &> /dev/null; then
        return 0
    else
        return 1
    fi
}

# Function to deploy service
deploy_service() {
    local service_name=$1
    local service_path=$2
    
    echo "📦 Deploying $service_name service..."
    
    if check_service "$service_name"; then
        echo "✅ Service $service_name exists, updating..."
        railway up --service "$service_name"
    else
        echo "🆕 Creating new service $service_name..."
        railway up --service "$service_name"
    fi
    
    echo "✅ $service_name deployment complete"
}

# Function to setup database
setup_database() {
    echo "🗄️  Setting up database..."
    
    # Check if PostgreSQL plugin exists
    if railway plugins | grep -q "postgresql"; then
        echo "✅ PostgreSQL plugin already exists"
    else
        echo "🆕 Adding PostgreSQL plugin..."
        railway add postgresql
    fi
    
    # Check if Redis plugin exists
    if railway plugins | grep -q "redis"; then
        echo "✅ Redis plugin already exists"
    else
        echo "🆕 Adding Redis plugin..."
        railway add redis
    fi
}

# Function to run database migrations
run_migrations() {
    echo "🔄 Running database migrations..."
    
    # Wait for database to be ready
    echo "⏳ Waiting for database to be ready..."
    sleep 10
    
    # Run migrations via API service
    if check_service "api"; then
        echo "🔄 Running database initialization..."
        railway run --service api python scripts/init_db.py || echo "⚠️  Database initialization may have already been completed"
    else
        echo "⚠️  API service not found, skipping migrations"
    fi
}

# Function to validate deployment
validate_deployment() {
    echo "🔍 Validating deployment..."
    
    # Check API service health
    if check_service "api"; then
        local api_url=$(railway domain --service api)
        if [ -n "$api_url" ]; then
            echo "🔍 Checking API health at https://$api_url/health"
            if curl -f -s "https://$api_url/health" > /dev/null; then
                echo "✅ API service is healthy"
            else
                echo "⚠️  API service health check failed"
            fi
        fi
    fi
    
    # Check web-app service health
    if check_service "web-app"; then
        local webapp_url=$(railway domain --service web-app)
        if [ -n "$webapp_url" ]; then
            echo "🔍 Checking web-app health at https://$webapp_url/api/health"
            if curl -f -s "https://$webapp_url/api/health" > /dev/null; then
                echo "✅ Web-app service is healthy"
            else
                echo "⚠️  Web-app service health check failed"
            fi
        fi
    fi
}

# Main deployment process
main() {
    echo "🏁 Starting deployment process..."
    
    # Setup database services first
    setup_database
    
    # Deploy API service first (backend)
    deploy_service "api" "./api"
    
    # Deploy web-app service (frontend)
    deploy_service "web-app" "./web-app"
    
    # Run database migrations
    run_migrations
    
    # Validate deployment
    validate_deployment
    
    echo ""
    echo "🎉 Deployment complete!"
    echo ""
    echo "📋 Service URLs:"
    
    if check_service "api"; then
        local api_url=$(railway domain --service api)
        [ -n "$api_url" ] && echo "   API: https://$api_url"
    fi
    
    if check_service "web-app"; then
        local webapp_url=$(railway domain --service web-app)
        [ -n "$webapp_url" ] && echo "   Web App: https://$webapp_url"
    fi
    
    echo ""
    echo "📖 Next steps:"
    echo "   1. Configure Microsoft SSO environment variables in Railway dashboard"
    echo "   2. Set JWT_SECRET_KEY in Railway dashboard"
    echo "   3. Test the application functionality"
    echo "   4. Monitor logs: railway logs --service api"
    echo ""
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Deploy Meetily application to Railway.app"
        echo ""
        echo "Options:"
        echo "  --help, -h     Show this help message"
        echo "  --api-only     Deploy only the API service"
        echo "  --web-only     Deploy only the web-app service"
        echo "  --validate     Only validate existing deployment"
        echo ""
        exit 0
        ;;
    --api-only)
        echo "🚀 Deploying API service only..."
        setup_database
        deploy_service "api" "./api"
        run_migrations
        ;;
    --web-only)
        echo "🚀 Deploying web-app service only..."
        deploy_service "web-app" "./web-app"
        ;;
    --validate)
        echo "🔍 Validating deployment only..."
        validate_deployment
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