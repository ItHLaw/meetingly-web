from pydantic_settings import BaseSettings
from typing import List, Optional
import os
from functools import lru_cache

class Settings(BaseSettings):
    # Application
    APP_NAME: str = "Meetily API"
    APP_VERSION: str = "2.0.0"
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://user:password@localhost/meetily")
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20
    
    # Redis
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")
    REDIS_EXPIRE_TIME: int = 3600  # 1 hour
    
    # Microsoft SSO
    MICROSOFT_CLIENT_ID: str = os.getenv("MICROSOFT_CLIENT_ID", "")
    MICROSOFT_CLIENT_SECRET: str = os.getenv("MICROSOFT_CLIENT_SECRET", "")
    MICROSOFT_TENANT_ID: str = os.getenv("MICROSOFT_TENANT_ID", "common")
    MICROSOFT_AUTHORITY: str = f"https://login.microsoftonline.com/{os.getenv('MICROSOFT_TENANT_ID', 'common')}"
    MICROSOFT_SCOPE: str = os.getenv("MICROSOFT_SCOPE", "openid profile email User.Read")
    MICROSOFT_JWKS_URL: str = f"https://login.microsoftonline.com/{os.getenv('MICROSOFT_TENANT_ID', 'common')}/discovery/v2.0/keys"
    MICROSOFT_ISSUER: str = f"https://login.microsoftonline.com/{os.getenv('MICROSOFT_TENANT_ID', 'common')}/v2.0"
    
    # JWT
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))  # 24 hours
    JWT_REFRESH_EXPIRE_DAYS: int = int(os.getenv("JWT_REFRESH_EXPIRE_DAYS", "30"))
    JWT_ISSUER: str = "meetily-api"
    JWT_AUDIENCE: str = "meetily-web"
    
    # CORS - Dynamic based on environment
    @property
    def CORS_ORIGINS(self) -> List[str]:
        if self.ENVIRONMENT == "production":
            # In production, get from environment or use Railway domains
            origins = os.getenv("CORS_ORIGINS", "").split(",") if os.getenv("CORS_ORIGINS") else []
            # Add Railway app domains
            origins.extend([
                "https://*.railway.app",
                "https://*.up.railway.app"
            ])
            return [origin.strip() for origin in origins if origin.strip()]
        else:
            return [
                "http://localhost:3000",
                "http://localhost:3001",
                "http://127.0.0.1:3000",
                "http://127.0.0.1:3001"
            ]
    
    # Security
    ALLOWED_HOSTS: List[str] = os.getenv("ALLOWED_HOSTS", "*").split(",") if os.getenv("ALLOWED_HOSTS") else ["*"]
    SECRET_KEY: str = os.getenv("SECRET_KEY", JWT_SECRET_KEY)
    SECURITY_HEADERS: bool = os.getenv("SECURITY_HEADERS", "true").lower() == "true"
    CSRF_PROTECTION: bool = os.getenv("CSRF_PROTECTION", "true").lower() == "true"
    SECURE_COOKIES: bool = os.getenv("SECURE_COOKIES", "true" if ENVIRONMENT == "production" else "false").lower() == "true"
    
    # File Storage
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "./uploads")
    MAX_FILE_SIZE: int = int(os.getenv("MAX_FILE_SIZE", str(100 * 1024 * 1024)))  # 100MB
    ALLOWED_FILE_TYPES: List[str] = [".mp3", ".wav", ".m4a", ".flac", ".ogg", ".webm"]
    
    # External APIs
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    
    # Whisper Service
    WHISPER_SERVICE_URL: str = os.getenv("WHISPER_SERVICE_URL", "http://localhost:8080")
    WHISPER_MODEL: str = os.getenv("WHISPER_MODEL", "base")
    
    # Encryption for API keys
    ENCRYPTION_KEY: Optional[str] = os.getenv("ENCRYPTION_KEY")
    
    # Environment
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    PORT: int = int(os.getenv("PORT", "8000"))
    
    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO" if ENVIRONMENT == "production" else "DEBUG")
    
    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = int(os.getenv("RATE_LIMIT_PER_MINUTE", "60"))
    
    # Session Management
    SESSION_EXPIRE_HOURS: int = int(os.getenv("SESSION_EXPIRE_HOURS", "24"))
    
    # Background Tasks
    CELERY_BROKER_URL: str = REDIS_URL
    CELERY_RESULT_BACKEND: str = REDIS_URL
    
    # Health Check
    HEALTH_CHECK_INTERVAL: int = 30
    
    class Config:
        env_file = ".env"
        case_sensitive = True

@lru_cache()
def get_settings() -> Settings:
    return Settings()

settings = get_settings()