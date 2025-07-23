# Architecture Decisions - Meetingly Web Migration

This document outlines the architectural decisions made during the Railway.app migration and code consolidation.

## Frontend Architecture Decision

**Decision**: Use `web-app/` as the primary frontend application

**Rationale**:
- **Railway.app Compatibility**: Web-app is specifically designed for web deployment
- **Comprehensive Features**: Contains complete authentication, error handling, and offline support
- **Modern Patterns**: Uses latest React patterns, comprehensive TypeScript support
- **Deployment Ready**: Configured for cloud deployment with proper health checks

**Frontend Migration Status**:
- ✅ **Primary**: `/web-app/` - Next.js 14.2.25 web application
- 📋 **Deprecated**: `/frontend/` - Tauri desktop application (keep for desktop use)

## Backend Architecture Decision

**Decision**: Use `api/` as the primary backend implementation

**Rationale**:
- **Enterprise Ready**: FastAPI 0.104.1 with comprehensive middleware
- **Feature Complete**: Full authentication, user isolation, error handling
- **Production Ready**: Includes retry logic, monitoring, and security features
- **Database Integration**: Complete PostgreSQL setup with migrations

**Backend Migration Status**:
- ✅ **Primary**: `/api/` - FastAPI backend with full feature set
- 📋 **Deprecated**: `/backend/` - Minimal FastAPI implementation (archive)

## Technology Stack Standardization

### Next.js Version
- **Standardized**: Version 14.2.25
- **Updated**: Both frontend applications now use the same version

### TypeScript Configuration
- **Target**: ES2020 (unified across all applications)
- **Module Resolution**: Bundler (Next.js optimized)
- **Strict Mode**: Enabled for better type safety

### Dependency Management
- **Package Manager**: npm
- **Node Version**: 18+ (LTS)
- **Python Version**: 3.11+ (for backend)

## Code Quality Standards

### Import Style
- **Standard**: Single quotes (`'`)
- **ESLint Rules**: Enforced via `.eslintrc.json`
- **Import Order**: Alphabetical with grouping

### Type Safety
- **Enums**: Use TypeScript enums instead of string literals
- **Interfaces**: Consistent interface definitions across applications
- **Error Handling**: Standardized error types and handling patterns

## Migration Guidelines

### For New Features
1. **Primary Development**: Use `/web-app/` for web features
2. **Backend Development**: Use `/api/` for server-side functionality
3. **Desktop Features**: Continue using `/frontend/` only for desktop-specific needs

### For Existing Code
1. **Web Features**: Migrate from `/frontend/` to `/web-app/` as needed
2. **Backend Logic**: Consolidate from `/backend/` to `/api/`
3. **Shared Code**: Extract to common utilities where appropriate

## Deployment Configuration

### Railway.app Deployment
- **Primary Service**: `/web-app/` (Next.js application)
- **API Service**: `/api/` (FastAPI backend)
- **Database**: PostgreSQL (Railway managed)
- **Cache**: Redis (Railway managed)

### Environment Variables
```bash
# Web App
NEXT_PUBLIC_API_URL=https://api.meetingly.app
NEXT_PUBLIC_MICROSOFT_CLIENT_ID=<client_id>
NEXT_PUBLIC_MICROSOFT_TENANT_ID=<tenant_id>

# API
DATABASE_URL=<postgresql_url>
REDIS_URL=<redis_url>
MICROSOFT_CLIENT_SECRET=<client_secret>
JWT_SECRET_KEY=<jwt_secret>
```

## Future Considerations

### Short Term (Next Sprint)
- Complete migration of critical features to primary architecture
- Remove deprecated code after thorough testing
- Optimize build and deployment processes

### Medium Term (Next Quarter)
- Consider micro-frontend architecture if desktop and web diverge significantly
- Implement shared component library for common UI elements
- Add comprehensive monitoring and observability

### Long Term (Next Year)
- Evaluate modern frameworks (React 19, Next.js 15+)
- Consider server-side rendering optimizations
- Implement advanced caching strategies

## Decision Log

| Date | Decision | Rationale | Impact |
|------|----------|-----------|---------|
| 2025-07-23 | Primary Frontend: web-app | Railway deployment focus | High |
| 2025-07-23 | Primary Backend: api | Enterprise features | High |
| 2025-07-23 | Next.js 14.2.25 | Latest stable version | Medium |
| 2025-07-23 | TypeScript ES2020 | Modern JavaScript features | Low |

---

This document should be updated as architectural decisions evolve. All major changes should be documented with rationale and impact assessment.