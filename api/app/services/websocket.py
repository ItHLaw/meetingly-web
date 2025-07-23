"""
WebSocket service for real-time updates and notifications.
Handles connection management and broadcasting updates to connected clients.
"""

import json
import logging
from typing import Dict, List, Set, Optional, Any
from datetime import datetime
import asyncio
from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User
from app.models.meeting import Meeting, ProcessingJob
from app.middleware.jwt_auth import verify_jwt_token

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections and broadcasting."""
    
    def __init__(self):
        # Store active connections by user_id
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        # Store connection metadata
        self.connection_metadata: Dict[WebSocket, Dict[str, Any]] = {}
    
    async def connect(self, websocket: WebSocket, user_id: str, connection_info: Dict[str, Any]):
        """Accept a new WebSocket connection."""
        await websocket.accept()
        
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        
        self.active_connections[user_id].add(websocket)
        self.connection_metadata[websocket] = {
            'user_id': user_id,
            'connected_at': datetime.utcnow(),
            'last_ping': datetime.utcnow(),
            **connection_info
        }
        
        logger.info(f"WebSocket connected for user {user_id}. Total connections: {len(self.connection_metadata)}")
        
        # Send connection confirmation
        await self.send_personal_message({
            'type': 'connection_established',
            'user_id': user_id,
            'timestamp': datetime.utcnow().isoformat(),
            'server_time': datetime.utcnow().isoformat()
        }, websocket)
    
    def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection."""
        if websocket in self.connection_metadata:
            user_id = self.connection_metadata[websocket]['user_id']
            
            # Remove from active connections
            if user_id in self.active_connections:
                self.active_connections[user_id].discard(websocket)
                if not self.active_connections[user_id]:
                    del self.active_connections[user_id]
            
            # Remove metadata
            del self.connection_metadata[websocket]
            
            logger.info(f"WebSocket disconnected for user {user_id}. Total connections: {len(self.connection_metadata)}")
    
    async def send_personal_message(self, message: Dict[str, Any], websocket: WebSocket):
        """Send a message to a specific WebSocket connection."""
        try:
            await websocket.send_text(json.dumps(message, default=str))
        except Exception as e:
            logger.error(f"Failed to send message to WebSocket: {e}")
            self.disconnect(websocket)
    
    async def send_to_user(self, message: Dict[str, Any], user_id: str):
        """Send a message to all connections for a specific user."""
        if user_id not in self.active_connections:
            logger.debug(f"No active connections for user {user_id}")
            return
        
        # Send to all connections for the user
        disconnected_connections = []
        for websocket in self.active_connections[user_id].copy():
            try:
                await websocket.send_text(json.dumps(message, default=str))
            except Exception as e:
                logger.error(f"Failed to send message to user {user_id}: {e}")
                disconnected_connections.append(websocket)
        
        # Clean up disconnected connections
        for websocket in disconnected_connections:
            self.disconnect(websocket)
    
    async def broadcast(self, message: Dict[str, Any]):
        """Broadcast a message to all connected clients."""
        if not self.connection_metadata:
            return
        
        disconnected_connections = []
        for websocket in list(self.connection_metadata.keys()):
            try:
                await websocket.send_text(json.dumps(message, default=str))
            except Exception as e:
                logger.error(f"Failed to broadcast message: {e}")
                disconnected_connections.append(websocket)
        
        # Clean up disconnected connections
        for websocket in disconnected_connections:
            self.disconnect(websocket)
    
    def get_user_connections(self, user_id: str) -> List[WebSocket]:
        """Get all active connections for a user."""
        return list(self.active_connections.get(user_id, []))
    
    def get_connection_count(self) -> int:
        """Get total number of active connections."""
        return len(self.connection_metadata)
    
    def get_user_count(self) -> int:
        """Get number of unique users connected."""
        return len(self.active_connections)
    
    async def ping_all_connections(self):
        """Send ping to all connections to keep them alive."""
        ping_message = {
            'type': 'ping',
            'timestamp': datetime.utcnow().isoformat()
        }
        
        disconnected_connections = []
        for websocket in list(self.connection_metadata.keys()):
            try:
                await websocket.send_text(json.dumps(ping_message, default=str))
                self.connection_metadata[websocket]['last_ping'] = datetime.utcnow()
            except Exception as e:
                logger.error(f"Failed to ping connection: {e}")
                disconnected_connections.append(websocket)
        
        # Clean up disconnected connections
        for websocket in disconnected_connections:
            self.disconnect(websocket)


# Global connection manager instance
manager = ConnectionManager()


class WebSocketService:
    """Service for WebSocket-related operations."""
    
    def __init__(self, connection_manager: ConnectionManager):
        self.manager = connection_manager
    
    async def notify_processing_status_update(
        self, 
        user_id: str, 
        job_id: str, 
        meeting_id: str, 
        status: str, 
        progress: Optional[int] = None,
        error_message: Optional[str] = None,
        result: Optional[Dict[str, Any]] = None
    ):
        """Notify user about processing status updates."""
        message = {
            'type': 'processing_status_update',
            'job_id': job_id,
            'meeting_id': meeting_id,
            'status': status,
            'progress': progress,
            'error_message': error_message,
            'result': result,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        await self.manager.send_to_user(message, user_id)
        logger.info(f"Sent processing status update to user {user_id}: {status}")
    
    async def notify_meeting_created(self, user_id: str, meeting_data: Dict[str, Any]):
        """Notify user about new meeting creation."""
        message = {
            'type': 'meeting_created',
            'meeting': meeting_data,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        await self.manager.send_to_user(message, user_id)
        logger.info(f"Sent meeting created notification to user {user_id}")
    
    async def notify_meeting_updated(self, user_id: str, meeting_data: Dict[str, Any]):
        """Notify user about meeting updates."""
        message = {
            'type': 'meeting_updated',
            'meeting': meeting_data,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        await self.manager.send_to_user(message, user_id)
        logger.info(f"Sent meeting updated notification to user {user_id}")
    
    async def notify_transcript_ready(self, user_id: str, meeting_id: str, transcript_data: Dict[str, Any]):
        """Notify user when transcript is ready."""
        message = {
            'type': 'transcript_ready',
            'meeting_id': meeting_id,
            'transcript': transcript_data,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        await self.manager.send_to_user(message, user_id)
        logger.info(f"Sent transcript ready notification to user {user_id}")
    
    async def notify_summary_ready(self, user_id: str, meeting_id: str, summary_data: Dict[str, Any]):
        """Notify user when summary is ready."""
        message = {
            'type': 'summary_ready',
            'meeting_id': meeting_id,
            'summary': summary_data,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        await self.manager.send_to_user(message, user_id)
        logger.info(f"Sent summary ready notification to user {user_id}")
    
    async def notify_error(self, user_id: str, error_type: str, error_message: str, context: Optional[Dict[str, Any]] = None):
        """Notify user about errors."""
        message = {
            'type': 'error',
            'error_type': error_type,
            'error_message': error_message,
            'context': context or {},
            'timestamp': datetime.utcnow().isoformat()
        }
        
        await self.manager.send_to_user(message, user_id)
        logger.info(f"Sent error notification to user {user_id}: {error_type}")
    
    async def send_system_notification(self, user_id: str, title: str, message: str, notification_type: str = 'info'):
        """Send system notification to user."""
        notification = {
            'type': 'system_notification',
            'notification_type': notification_type,  # info, success, warning, error
            'title': title,
            'message': message,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        await self.manager.send_to_user(notification, user_id)
        logger.info(f"Sent system notification to user {user_id}: {title}")
    
    async def broadcast_maintenance_notice(self, message: str, scheduled_time: Optional[datetime] = None):
        """Broadcast maintenance notice to all users."""
        notice = {
            'type': 'maintenance_notice',
            'message': message,
            'scheduled_time': scheduled_time.isoformat() if scheduled_time else None,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        await self.manager.broadcast(notice)
        logger.info("Broadcast maintenance notice to all users")


# Global WebSocket service instance
websocket_service = WebSocketService(manager)


async def authenticate_websocket_connection(websocket: WebSocket, token: str) -> Optional[str]:
    """Authenticate WebSocket connection using JWT token."""
    try:
        # Verify JWT token
        payload = verify_jwt_token(token)
        if not payload:
            return None
        
        user_id = payload.get('sub')
        if not user_id:
            return None
        
        # Verify user exists in database
        db = next(get_db())
        try:
            user = db.query(User).filter(User.id == user_id).first()
            if not user or not user.is_active:
                return None
            
            return user_id
        finally:
            db.close()
    
    except Exception as e:
        logger.error(f"WebSocket authentication failed: {e}")
        return None


async def handle_websocket_message(websocket: WebSocket, message: str, user_id: str):
    """Handle incoming WebSocket messages from clients."""
    try:
        data = json.loads(message)
        message_type = data.get('type')
        
        if message_type == 'pong':
            # Handle pong response
            manager.connection_metadata[websocket]['last_ping'] = datetime.utcnow()
            
        elif message_type == 'subscribe_to_job':
            # Subscribe to specific job updates
            job_id = data.get('job_id')
            if job_id:
                # Store subscription info
                if 'subscriptions' not in manager.connection_metadata[websocket]:
                    manager.connection_metadata[websocket]['subscriptions'] = set()
                manager.connection_metadata[websocket]['subscriptions'].add(f"job:{job_id}")
                
                await manager.send_personal_message({
                    'type': 'subscription_confirmed',
                    'subscription': f"job:{job_id}",
                    'timestamp': datetime.utcnow().isoformat()
                }, websocket)
        
        elif message_type == 'unsubscribe_from_job':
            # Unsubscribe from job updates
            job_id = data.get('job_id')
            if job_id and 'subscriptions' in manager.connection_metadata[websocket]:
                manager.connection_metadata[websocket]['subscriptions'].discard(f"job:{job_id}")
        
        elif message_type == 'get_connection_info':
            # Send connection information
            info = {
                'type': 'connection_info',
                'user_id': user_id,
                'connected_at': manager.connection_metadata[websocket]['connected_at'].isoformat(),
                'total_connections': manager.get_connection_count(),
                'timestamp': datetime.utcnow().isoformat()
            }
            await manager.send_personal_message(info, websocket)
        
        else:
            logger.warning(f"Unknown WebSocket message type: {message_type}")
    
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in WebSocket message: {e}")
        await manager.send_personal_message({
            'type': 'error',
            'error_message': 'Invalid JSON format',
            'timestamp': datetime.utcnow().isoformat()
        }, websocket)
    
    except Exception as e:
        logger.error(f"Error handling WebSocket message: {e}")
        await manager.send_personal_message({
            'type': 'error',
            'error_message': 'Internal server error',
            'timestamp': datetime.utcnow().isoformat()
        }, websocket)


async def start_ping_task():
    """Start background task to ping all connections periodically."""
    while True:
        try:
            await asyncio.sleep(30)  # Ping every 30 seconds
            await manager.ping_all_connections()
        except Exception as e:
            logger.error(f"Error in ping task: {e}")
            await asyncio.sleep(60)  # Wait longer if there's an error