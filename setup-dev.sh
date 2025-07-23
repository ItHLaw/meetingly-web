#!/bin/bash

# Meetily Development Environment Setup Script
# This script sets up the development environment for the Meetily web application

set -e

echo "🛠️  Meetily Development Environment Setup"
echo "========================================"

# Check prerequisites
echo "🔍 Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version $NODE_VERSION is too old. Please install Node.js 18+."
    exit 1
fi

echo "✅ Node.js $(node --version) found"

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.11+ first."
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1-2)
echo "✅ Python $PYTHON_VERSION found"

# Check pip
if ! command -v pip3 &> /dev/null; then
    echo "❌ pip3 is not installed. Please install pip3 first."
    exit 1
fi

echo "✅ pip3 found"

# Setup API backend
echo ""
echo "🐍 Setting up API backend..."
cd api

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "📦 Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "🔄 Activating virtual environment..."
source venv/bin/activate

# Install Python dependencies
echo "📥 Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "⚙️  Creating API .env file..."
    cp .env.example .env
    echo "📝 Please edit api/.env with your configuration"
fi

# Create uploads directory
mkdir -p uploads

echo "✅ API backend setup complete"

# Setup web frontend
echo ""
echo "🌐 Setting up web frontend..."
cd ../web-app

# Install Node.js dependencies
echo "📥 Installing Node.js dependencies..."
npm install

# Create .env.local file if it doesn't exist
if [ ! -f ".env.local" ]; then
    echo "⚙️  Creating web app .env.local file..."
    cp .env.example .env.local
    echo "📝 Please edit web-app/.env.local with your configuration"
fi

echo "✅ Web frontend setup complete"

# Go back to root directory
cd ..

echo ""
echo "🎉 Development environment setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Configure environment variables:"
echo "   - Edit api/.env with your settings"
echo "   - Edit web-app/.env.local with your settings"
echo ""
echo "2. Set up Microsoft SSO (see README_WEB.md for details)"
echo ""
echo "3. Start the development servers:"
echo "   Terminal 1 (API):"
echo "   cd api && source venv/bin/activate && uvicorn main:app --reload"
echo ""
echo "   Terminal 2 (Web App):"
echo "   cd web-app && npm run dev"
echo ""
echo "4. Access the application:"
echo "   - Frontend: http://localhost:3000"
echo "   - API: http://localhost:8000"
echo "   - API Docs: http://localhost:8000/docs"
echo ""
echo "📚 For more information, see:"
echo "   - README_WEB.md"
echo "   - PROJECT_STRUCTURE.md"
echo "   - .kiro/specs/web-app-railway-migration/"
echo ""
echo "Happy coding! 🚀"