"""
Pytest configuration file with fixtures for testing
"""

import os
import pytest
import asyncio
from typing import AsyncGenerator, Dict, Any, Generator
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
import uuid
import jwt
from datetime import datetime, timedelta

from app.core.config import settings
from app.core.database import Base, get_db
from app.models.user import User
from app.models.meeting import Meeting
from app.middleware.auth import AuthMiddleware
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.security import SecurityHeadersMiddleware, InputValidationMiddleware
from app.middleware.error_handling import setup_error_handlers
from main import app as main_app

# Test database URL
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", 
    "postgresql+asyncpg://postgres:postgres@localhost:5432/meetily_test"
)

# Create test engine
test_engine = create_async_engine(
    TEST_DATABASE_URL, 
    poolclass=NullPool,
    echo=False
)

# Create test session
TestAsyncSessionLocal = sessionmaker(
    test_engine, 
    class_=AsyncSession, 
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

# Override the get_db dependency
async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with TestAsyncSessionLocal() as session:
        yield session

@pytest.fixture
async def setup_database() -> AsyncGenerator[None, None]:
    """Create test database tables before tests and drop them after"""
    # Create tables
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    
    yield
    
    # Drop tables
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest.fixture
def app(setup_database) -> FastAPI:
    """Create a FastAPI test application"""
    # Override database dependency
    main_app.dependency_overrides[get_db] = override_get_db
    
    return main_app

@pytest.fixture
def client(app) -> Generator[TestClient, None, None]:
    """Create a test client for the FastAPI application"""
    with TestClient(app) as client:
        yield client

@pytest.fixture
async def test_db() -> AsyncGenerator[AsyncSession, None]:
    """Get a test database session"""
    async with TestAsyncSessionLocal() as session:
        yield session

@pytest.fixture
def test_user() -> Dict[str, Any]:
    """Create a test user data"""
    return {
        "id": str(uuid.uuid4()),
        "email": "test@example.com",
        "name": "Test User",
        "microsoft_id": f"test-{uuid.uuid4()}",
        "tenant_id": "test-tenant",
        "is_active": True
    }

@pytest.fixture
async def db_test_user(test_db, test_user) -> User:
    """Create a test user in the database"""
    user = User(**test_user)
    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)
    return user

@pytest.fixture
def auth_token(test_user) -> str:
    """Create a JWT auth token for the test user"""
    payload = {
        "sub": test_user["id"],
        "email": test_user["email"],
        "name": test_user["name"],
        "type": "access",
        "exp": datetime.utcnow() + timedelta(minutes=15),
        "iat": datetime.utcnow(),
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE
    }
    
    token = jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM
    )
    
    return token

@pytest.fixture
def auth_headers(auth_token) -> Dict[str, str]:
    """Create authorization headers with JWT token"""
    return {"Authorization": f"Bearer {auth_token}"}

@pytest.fixture
async def test_meeting(test_db, db_test_user) -> Meeting:
    """Create a test meeting in the database"""
    meeting = Meeting(
        id=str(uuid.uuid4()),
        user_id=db_test_user.id,
        title="Test Meeting",
        processing_status="completed"
    )
    test_db.add(meeting)
    await test_db.commit()
    await test_db.refresh(meeting)
    return meeting

# Event loop fixture for async tests
@pytest.fixture(scope="session")
def event_loop():
    """Create an event loop for async tests"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()