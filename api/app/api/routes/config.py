from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any
from pydantic import BaseModel

from app.core.database import get_db
from app.models.user import User
from app.services.auth import get_current_user
from app.services.config import ConfigService

router = APIRouter()
config_service = ConfigService()

class ModelConfigRequest(BaseModel):
    provider: str
    model: str
    whisper_model: str
    api_key: str = None

class UserPreferencesRequest(BaseModel):
    preferences: Dict[str, Any]

@router.get("/models")
async def get_available_models():
    """Get available AI models and configurations"""
    try:
        models = await config_service.get_available_models()
        return {
            "models": models,
            "whisper_models": [
                "tiny", "base", "small", "medium", "large", "large-v2", "large-v3"
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get models: {str(e)}")

@router.post("/models")
async def save_model_config(
    config: ModelConfigRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Save user's model configuration"""
    try:
        saved_config = await config_service.save_user_model_config(
            user_id=current_user.id,
            provider=config.provider,
            model=config.model,
            whisper_model=config.whisper_model,
            api_key=config.api_key,
            db=db
        )
        
        return {
            "message": "Model configuration saved successfully",
            "config": {
                "provider": saved_config.provider,
                "model": saved_config.model,
                "whisper_model": saved_config.whisper_model,
                "created_at": saved_config.created_at
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save config: {str(e)}")

@router.get("/models/user")
async def get_user_model_config(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get user's current model configuration"""
    try:
        config = await config_service.get_user_model_config(current_user.id, db)
        if not config:
            return {"config": None}
        
        return {
            "config": {
                "provider": config.provider,
                "model": config.model,
                "whisper_model": config.whisper_model,
                "created_at": config.created_at,
                "updated_at": config.updated_at
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get config: {str(e)}")

@router.get("/user")
async def get_user_preferences(
    current_user: User = Depends(get_current_user)
):
    """Get user preferences"""
    return {
        "preferences": current_user.preferences,
        "user_id": current_user.id,
        "email": current_user.email,
        "name": current_user.name
    }

@router.post("/user")
async def update_user_preferences(
    preferences: UserPreferencesRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update user preferences"""
    try:
        updated_user = await config_service.update_user_preferences(
            user_id=current_user.id,
            preferences=preferences.preferences,
            db=db
        )
        
        return {
            "message": "Preferences updated successfully",
            "preferences": updated_user.preferences
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update preferences: {str(e)}")