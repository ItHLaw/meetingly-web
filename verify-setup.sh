#!/bin/bash

# Meetily Project Structure Verification Script
# This script verifies that all core infrastructure components are properly set up

set -e

echo "🔍 Meetily Project Structure Verification"
echo "========================================"

# Function to check if file exists
check_file() {
    if [ -f "$1" ]; then
        echo "✅ $1"
    else
        echo "❌ $1 (missing)"
        return 1
    fi
}

# Function to check if directory exists
check_dir() {
    if [ -d "$1" ]; then
        echo "✅ $1/"
    else
        echo "❌ $1/ (missing)"
        return 1
    fi
}

echo ""
echo "📁 Checking project structure..."

# Root level files
check_file "railway.json"
check_file "deploy-railway.sh"
check_file "setup-dev.sh"
check_file "verify-setup.sh"
check_file "PROJECT_STRUCTURE.md"
check_file "README_WEB.md"

# Web App structure
echo ""
echo "🌐 Checking web-app structure..."
check_dir "web-app"
check_file "web-app/package.json"
check_file "web-app/next.config.js"
check_file "web-app/tailwind.config.js"
check_file "web-app/tsconfig.json"
check_file "web-app/Dockerfile"
check_file "web-app/railway.toml"
check_file "web-app/.env.example"
check_dir "web-app/src"
check_dir "web-app/src/app"
check_file "web-app/src/app/api/health/route.ts"

# API structure
echo ""
echo "🐍 Checking api structure..."
check_dir "api"
check_file "api/main.py"
check_file "api/requirements.txt"
check_file "api/Dockerfile"
check_file "api/railway.toml"
check_file "api/.env.example"
check_dir "api/app"
check_dir "api/app/core"
check_file "api/app/core/config.py"
check_dir "api/app/api"
check_dir "api/app/api/routes"

# Spec files
echo ""
echo "📋 Checking specification files..."
check_dir ".kiro"
check_dir ".kiro/specs"
check_dir ".kiro/specs/web-app-railway-migration"
check_file ".kiro/specs/web-app-railway-migration/requirements.md"
check_file ".kiro/specs/web-app-railway-migration/design.md"
check_file ".kiro/specs/web-app-railway-migration/tasks.md"

echo ""
echo "🔧 Checking configuration files..."

# Check Railway configuration
if [ -f "railway.json" ]; then
    if grep -q "web-app" railway.json && grep -q "api" railway.json; then
        echo "✅ Railway multi-service configuration"
    else
        echo "❌ Railway configuration incomplete"
    fi
fi

# Check Docker configurations
if [ -f "web-app/Dockerfile" ] && [ -f "api/Dockerfile" ]; then
    echo "✅ Docker configurations present"
else
    echo "❌ Docker configurations missing"
fi

# Check environment examples
if [ -f "web-app/.env.example" ] && [ -f "api/.env.example" ]; then
    echo "✅ Environment configuration examples"
else
    echo "❌ Environment configuration examples missing"
fi

echo ""
echo "🚀 Checking deployment readiness..."

# Check if scripts are executable
if [ -x "deploy-railway.sh" ] && [ -x "setup-dev.sh" ]; then
    echo "✅ Deployment scripts are executable"
else
    echo "❌ Deployment scripts need execute permissions"
    echo "   Run: chmod +x deploy-railway.sh setup-dev.sh verify-setup.sh"
fi

# Check Next.js configuration
if [ -f "web-app/next.config.js" ]; then
    if grep -q "standalone" web-app/next.config.js; then
        echo "✅ Next.js configured for standalone deployment"
    else
        echo "❌ Next.js standalone configuration missing"
    fi
fi

# Check API health endpoint
if [ -f "api/main.py" ]; then
    if grep -q "/health" api/main.py; then
        echo "✅ API health check endpoint configured"
    else
        echo "❌ API health check endpoint missing"
    fi
fi

echo ""
echo "📊 Summary:"
echo "==========="

# Count files
TOTAL_FILES=0
EXISTING_FILES=0

# Core files to check
CORE_FILES=(
    "railway.json"
    "deploy-railway.sh"
    "setup-dev.sh"
    "PROJECT_STRUCTURE.md"
    "README_WEB.md"
    "web-app/package.json"
    "web-app/Dockerfile"
    "web-app/railway.toml"
    "web-app/.env.example"
    "web-app/src/app/api/health/route.ts"
    "api/main.py"
    "api/requirements.txt"
    "api/Dockerfile"
    "api/railway.toml"
    "api/.env.example"
    "api/app/core/config.py"
)

for file in "${CORE_FILES[@]}"; do
    TOTAL_FILES=$((TOTAL_FILES + 1))
    if [ -f "$file" ]; then
        EXISTING_FILES=$((EXISTING_FILES + 1))
    fi
done

echo "📁 Files: $EXISTING_FILES/$TOTAL_FILES present"

if [ $EXISTING_FILES -eq $TOTAL_FILES ]; then
    echo "🎉 All core infrastructure components are properly set up!"
    echo ""
    echo "✅ Next steps:"
    echo "1. Run './setup-dev.sh' to set up development environment"
    echo "2. Configure environment variables in .env files"
    echo "3. Set up Microsoft SSO in Azure Portal"
    echo "4. Run './deploy-railway.sh' for Railway deployment"
    echo ""
    echo "📚 Documentation:"
    echo "- README_WEB.md - Main documentation"
    echo "- PROJECT_STRUCTURE.md - Detailed project structure"
    echo "- .kiro/specs/web-app-railway-migration/ - Technical specifications"
else
    echo "⚠️  Some components are missing. Please check the errors above."
    exit 1
fi