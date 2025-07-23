from typing import Dict, Any, Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from cryptography.fernet import Fernet
import os
import uuid
from datetime import datetime

from app.models.user import User, ModelConfig
from app.core.config import settings

class ConfigService:
    def __init__(self):
        # Initialize encryption for API keys
        self.encryption_key = os.getenv("ENCRYPTION_KEY", Fernet.generate_key())
        self.cipher = Fernet(self.encryption_key)
    
    async def get_available_models(self) -> Dict[str, List[str]]:
        """Get available AI models by provider"""
        return {
            "anthropic": [
                "claude-3-haiku-20240307",
                "claude-3-sonnet-20240229",
                "claude-3-opus-20240229"
            ],
            "openai": [
                "gpt-3.5-turbo",
                "gpt-4",
                "gpt-4-turbo-preview"
            ],
            "groq": [
                "mixtral-8x7b-32768",
                "llama2-70b-4096",
                "gemma-7b-it"
            ],
            "ollama": [
                "llama2",
                "mistral",
                "codellama"
            ]
        }
    
    async def save_user_model_config(
        self,
        user_id: str,
        provider: str,
        model: str,
        whisper_model: str,
        api_key: Optional[str],
        db: AsyncSession
    ) -> ModelConfig:
        """Save or update user's model configuration"""
        
        # Check if config already exists
        stmt = select(ModelConfig).where(ModelConfig.user_id == user_id)
        result = await db.execute(stmt)
        existing_config = result.scalar_one_or_none()
        
        # Encrypt API key if provided
        encrypted_api_key = None
        if api_key:
            encrypted_api_key = self.cipher.encrypt(api_key.encode()).decode()
        
        if existing_config:
            # Update existing config
            existing_config.provider = provider
            existing_config.model = model
            existing_config.whisper_model = whisper_model
            if encrypted_api_key:
                existing_config.api_key_encrypted = encrypted_api_key
            existing_config.updated_at = datetime.utcnow()
            config = existing_config
        else:
            # Create new config
            config = ModelConfig(
                id=str(uuid.uuid4()),
                user_id=user_id,
                provider=provider,
                model=model,
                whisper_model=whisper_model,
                api_key_encrypted=encrypted_api_key
            )
            db.add(config)
        
        await db.commit()
        await db.refresh(config)
        return config
    
    async def get_user_model_config(self, user_id: str, db: AsyncSession) -> Optional[ModelConfig]:
        """Get user's model configuration"""
        stmt = select(ModelConfig).where(ModelConfig.user_id == user_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def get_decrypted_api_key(self, user_id: str, db: AsyncSession) -> Optional[str]:
        """Get decrypted API key for user"""
        config = await self.get_user_model_config(user_id, db)
        if not config or not config.api_key_encrypted:
            return None
        
        try:
            decrypted_key = self.cipher.decrypt(config.api_key_encrypted.encode()).decode()
            return decrypted_key
        except Exception:
            return None
    
    async def update_user_preferences(
        self,
        user_id: str,
        preferences: Dict[str, Any],
        db: AsyncSession
    ) -> User:
        """Update user preferences"""
        stmt = select(User).where(User.id == user_id)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()
        
        if not user:
            raise ValueError("User not found")
        
        # Merge with existing preferences
        current_prefs = user.preferences or {}
        current_prefs.update(preferences)
        user.preferences = current_prefs
        user.updated_at = datetime.utcnow()
        
        await db.commit()
        await db.refresh(user)
        return user