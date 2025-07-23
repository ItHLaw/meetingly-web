# Meetily Web Application

A modern web application for recording, transcribing, and summarizing meetings using AI, migrated from desktop to web with Microsoft SSO authentication and Railway.app deployment.

## 🚀 Features

- 🎙️ **Audio Processing**: Upload and process meeting recordings
- 🤖 **AI Transcription**: Powered by OpenAI Whisper for accurate speech-to-text
- 📝 **Smart Summaries**: Generate intelligent meeting summaries using LLMs
- 🔐 **Microsoft SSO**: Secure authentication with Azure Active Directory
- ☁️ **Cloud Native**: Deployed on Railway.app with auto-scaling
- 📱 **Responsive Design**: Works seamlessly on desktop, tablet, and mobile
- 🔒 **Multi-tenant**: Complete user data isolation and security
- ⚡ **Real-time Updates**: Live processing status and notifications

## 🏗️ Architecture

### Technology Stack
- **Frontend**: Next.js 14 with App Router, TypeScript, Tailwind CSS
- **Backend**: FastAPI with Python 3.11, SQLAlchemy, Alembic
- **Database**: PostgreSQL (Railway managed)
- **Cache**: Redis (Railway managed)
- **Authentication**: Microsoft MSAL with JWT sessions
- **File Storage**: Railway volumes with secure access controls
- **Deployment**: Railway.app multi-service architecture

### System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Browser   │────│   Next.js App   │────│   FastAPI API   │
│                 │    │   (Port 3000)   │    │   (Port 8000)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                        │
                                │                        │
                       ┌─────────────────┐    ┌─────────────────┐
                       │  Microsoft SSO  │    │   PostgreSQL    │
                       │   (Azure AD)    │    │   (Railway)     │
                       └─────────────────┘    └─────────────────┘
                                                        │
                                               ┌─────────────────┐
                                               │      Redis      │
                                               │   (Railway)     │
                                               └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Python 3.11+ and pip
- Railway CLI (for deployment)
- Microsoft Azure account (for SSO setup)

### Local Development

1. **Clone the repository**:
```bash
git clone <repository-url>
cd meetily
```

2. **Set up the API backend**:
```bash
cd api
cp .env.example .env
# Configure your environment variables in .env
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

3. **Set up the web frontend**:
```bash
cd web-app
cp .env.example .env.local
# Configure your environment variables in .env.local
npm install
npm run dev
```

4. **Access the application**:
   - Frontend: http://localhost:3000
   - API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

### Microsoft SSO Setup

1. **Register Application in Azure Portal**:
   - Go to Azure Active Directory > App registrations
   - Create new registration with redirect URI: `http://localhost:3000/auth/callback`
   - Note the Application (client) ID and Directory (tenant) ID
   - Create a client secret

2. **Configure Environment Variables**:
   ```bash
   # API (.env)
   MICROSOFT_CLIENT_ID=your_client_id
   MICROSOFT_CLIENT_SECRET=your_client_secret
   MICROSOFT_TENANT_ID=your_tenant_id_or_common
   
   # Web App (.env.local)
   NEXT_PUBLIC_MICROSOFT_CLIENT_ID=your_client_id
   NEXT_PUBLIC_MICROSOFT_TENANT_ID=your_tenant_id_or_common
   ```

## 🚢 Railway.app Deployment

### Automated Deployment

Use the included deployment script:

```bash
chmod +x deploy-railway.sh
./deploy-railway.sh
```

### Manual Deployment

1. **Install Railway CLI**:
```bash
npm install -g @railway/cli
railway login
```

2. **Create Railway Project**:
```bash
railway init
```

3. **Deploy Services**:
```bash
# Deploy API
railway service create api
cd api && railway up --detach

# Deploy Web App
railway service create web-app  
cd web-app && railway up --detach
```

4. **Add Database Services**:
```bash
railway add postgresql
railway add redis
```

5. **Configure Environment Variables** in Railway dashboard:
   - Set production URLs and secrets
   - Link database and Redis services
   - Configure Microsoft SSO for production domains

### Environment Configuration

#### API Service Variables
```bash
ENVIRONMENT=production
DEBUG=false
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
MICROSOFT_CLIENT_ID=your_production_client_id
MICROSOFT_CLIENT_SECRET=your_production_client_secret
MICROSOFT_TENANT_ID=your_tenant_id
JWT_SECRET_KEY=your_secure_jwt_secret
```

#### Web App Service Variables
```bash
NODE_ENV=production
NEXT_PUBLIC_API_URL=https://your-api-service.railway.app
NEXT_PUBLIC_MICROSOFT_CLIENT_ID=your_production_client_id
NEXT_PUBLIC_MICROSOFT_TENANT_ID=your_tenant_id
```

## 📁 Project Structure

```
meetily/
├── web-app/                    # Next.js Frontend
│   ├── src/app/               # App Router pages
│   ├── src/components/        # React components
│   ├── src/lib/               # Utilities and API clients
│   ├── Dockerfile             # Container configuration
│   └── railway.toml           # Railway deployment config
│
├── api/                       # FastAPI Backend
│   ├── app/
│   │   ├── api/routes/        # API endpoints
│   │   ├── core/              # Core configuration
│   │   ├── models/            # Database models
│   │   ├── services/          # Business logic
│   │   └── middleware/        # Custom middleware
│   ├── Dockerfile             # Container configuration
│   └── railway.toml           # Railway deployment config
│
├── railway.json               # Multi-service configuration
├── deploy-railway.sh          # Deployment script
└── PROJECT_STRUCTURE.md       # Detailed structure docs
```

## 🔧 Development

### API Development

The FastAPI backend provides:
- RESTful API endpoints with automatic OpenAPI documentation
- Microsoft SSO authentication middleware
- User isolation and multi-tenancy
- File upload and processing
- Real-time WebSocket connections
- Background task processing

Key endpoints:
- `POST /auth/microsoft/callback` - Handle SSO authentication
- `GET /api/meetings` - List user meetings
- `POST /api/audio/upload` - Upload audio files
- `GET /health` - Health check

### Frontend Development

The Next.js frontend features:
- Server-side rendering with App Router
- Microsoft MSAL authentication
- Real-time updates with WebSockets
- Responsive design with Tailwind CSS
- Type-safe API integration

Key pages:
- `/` - Landing page
- `/dashboard` - Main application interface
- `/login` - Authentication page
- `/meeting-details` - Meeting view and editing

### Database Schema

The application uses PostgreSQL with the following key tables:
- `users` - User profiles from Microsoft SSO
- `meetings` - Meeting records with user isolation
- `transcripts` - Audio transcription results
- `processing_jobs` - Background task tracking
- `user_sessions` - Authentication sessions

## 🧪 Testing

### Backend Testing
```bash
cd api
pytest tests/ -v
```

### Frontend Testing
```bash
cd web-app
npm test
npm run test:e2e
```

## 📊 Monitoring

The application includes:
- Health check endpoints for both services
- Structured logging with configurable levels
- Error tracking and reporting
- Performance monitoring
- User activity analytics

## 🔒 Security

Security features include:
- Microsoft SSO with OAuth 2.0 + PKCE
- JWT-based session management
- User data isolation at database level
- HTTPS enforcement in production
- CORS protection
- Input validation and sanitization
- File upload security scanning
- Rate limiting per user

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

See CONTRIBUTING.md for detailed guidelines.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## 🆘 Support

- 📖 Documentation: See `/docs` directory
- 🐛 Issues: GitHub Issues
- 💬 Discussions: GitHub Discussions
- 📧 Email: [support email]

## 🗺️ Roadmap

- [ ] Mobile app development
- [ ] Advanced AI features
- [ ] Integration with calendar systems
- [ ] Team collaboration features
- [ ] Advanced analytics dashboard
- [ ] Multi-language support

---

**Built with ❤️ for better meeting management**