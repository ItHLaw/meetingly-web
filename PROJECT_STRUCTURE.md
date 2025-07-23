# Meetily Web Application - Project Structure

This document outlines the project structure for the Meetily web application migration to Railway.app.

## Overview

The project consists of two main services:
- **web-app**: Next.js frontend application
- **api**: FastAPI backend service

## Directory Structure

```
meetily/
├── web-app/                    # Next.js Frontend Service
│   ├── src/
│   │   ├── app/               # Next.js App Router
│   │   │   ├── api/           # API routes (health checks)
│   │   │   ├── dashboard/     # Dashboard pages
│   │   │   ├── login/         # Authentication pages
│   │   │   ├── globals.css    # Global styles
│   │   │   ├── layout.tsx     # Root layout
│   │   │   └── page.tsx       # Home page
│   │   ├── components/        # React components
│   │   │   ├── auth/          # Authentication components
│   │   │   └── ui/            # UI components
│   │   ├── config/            # Configuration files
│   │   ├── hooks/             # Custom React hooks
│   │   ├── lib/               # Utility libraries
│   │   ├── services/          # API service clients
│   │   ├── store/             # State management
│   │   └── types/             # TypeScript type definitions
│   ├── public/                # Static assets
│   ├── Dockerfile             # Docker configuration
│   ├── next.config.js         # Next.js configuration
│   ├── package.json           # Dependencies and scripts
│   ├── railway.toml           # Railway deployment config
│   ├── tailwind.config.js     # Tailwind CSS configuration
│   ├── tsconfig.json          # TypeScript configuration
│   └── .env.example           # Environment variables template
│
├── api/                       # FastAPI Backend Service
│   ├── app/
│   │   ├── api/
│   │   │   └── routes/        # API route handlers
│   │   │       ├── auth.py    # Authentication endpoints
│   │   │       ├── meetings.py # Meeting management
│   │   │       ├── audio.py   # Audio processing
│   │   │       └── config.py  # Configuration endpoints
│   │   ├── core/              # Core application modules
│   │   │   ├── config.py      # Application settings
│   │   │   └── database.py    # Database configuration
│   │   ├── middleware/        # Custom middleware
│   │   │   └── auth.py        # Authentication middleware
│   │   ├── models/            # Database models
│   │   │   ├── user.py        # User model
│   │   │   └── meeting.py     # Meeting model
│   │   └── services/          # Business logic services
│   │       ├── auth.py        # Authentication service
│   │       ├── audio.py       # Audio processing service
│   │       ├── config.py      # Configuration service
│   │       └── whisper.py     # Whisper integration
│   ├── uploads/               # File upload directory
│   ├── Dockerfile             # Docker configuration
│   ├── main.py                # FastAPI application entry point
│   ├── railway.toml           # Railway deployment config
│   ├── requirements.txt       # Python dependencies
│   └── .env.example           # Environment variables template
│
├── .kiro/                     # Kiro specifications
│   └── specs/
│       └── web-app-railway-migration/
│           ├── requirements.md
│           ├── design.md
│           └── tasks.md
│
├── railway.json               # Multi-service Railway configuration
├── PROJECT_STRUCTURE.md       # This file
└── README.md                  # Project documentation
```

## Service Configuration

### Web App Service (Frontend)
- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Authentication**: Microsoft MSAL
- **State Management**: Zustand + React Query
- **Port**: 3000
- **Health Check**: `/api/health`

### API Service (Backend)
- **Framework**: FastAPI
- **Language**: Python 3.11
- **Database**: PostgreSQL (Railway managed)
- **Cache**: Redis (Railway managed)
- **Authentication**: JWT with Microsoft SSO
- **File Storage**: Railway volumes
- **Port**: 8000
- **Health Check**: `/health`

## Railway.app Deployment

The application is configured for multi-service deployment on Railway.app:

1. **Web App Service**: Serves the Next.js frontend
2. **API Service**: Handles backend logic and API endpoints
3. **PostgreSQL Plugin**: Managed database service
4. **Redis Plugin**: Managed caching service

## Environment Variables

### Web App
- `NEXT_PUBLIC_API_URL`: Backend API URL
- `NEXT_PUBLIC_MICROSOFT_CLIENT_ID`: Microsoft SSO client ID
- `NEXT_PUBLIC_MICROSOFT_TENANT_ID`: Microsoft tenant ID
- `NODE_ENV`: Environment (production/development)

### API
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `MICROSOFT_CLIENT_ID`: Microsoft SSO client ID
- `MICROSOFT_CLIENT_SECRET`: Microsoft SSO client secret
- `JWT_SECRET_KEY`: JWT signing key
- `ENVIRONMENT`: Environment (production/development)

## Development Setup

1. Clone the repository
2. Copy `.env.example` to `.env` in both `web-app/` and `api/` directories
3. Configure environment variables
4. Install dependencies:
   ```bash
   cd web-app && npm install
   cd ../api && pip install -r requirements.txt
   ```
5. Run services:
   ```bash
   # Terminal 1 - API
   cd api && uvicorn main:app --reload
   
   # Terminal 2 - Web App
   cd web-app && npm run dev
   ```

## Production Deployment

The application is deployed using Railway.app with the following configuration:
- Multi-service deployment from single repository
- Automatic builds from Dockerfiles
- Managed PostgreSQL and Redis services
- Environment variable injection
- Health checks and auto-restart policies