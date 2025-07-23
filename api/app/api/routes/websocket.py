"""
WebSocket API routes for real-time communication.
Handles WebSocket connections, authentication, and message routing.
"""

import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, HTTPException
from typing import Optional

from app.services.websocket import (
    manager,
    websocket_service,
    authenticate_websocket_connection,
    handle_websocket_message
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None, description="JWT authentication token")
):
    """
    WebSocket endpoint for real-time communication.
    
    Authentication is performed using JWT token passed as query parameter.
    Once connected, clients can send/receive real-time updates.
    """
    
    # Authenticate the connection
    if not token:
        await websocket.close(code=4001, reason="Authentication token required")
        return
    
    user_id = await authenticate_websocket_connection(websocket, token)
    if not user_id:
        await websocket.close(code=4003, reason="Authentication failed")
        return
    
    # Accept the connection
    connection_info = {
        'client_info': websocket.headers.get('user-agent', 'Unknown'),
        'origin': websocket.headers.get('origin', 'Unknown')
    }
    
    await manager.connect(websocket, user_id, connection_info)
    
    try:
        # Listen for messages
        while True:
            try:
                # Receive message from client
                message = await websocket.receive_text()
                await handle_websocket_message(websocket, message, user_id)
                
            except WebSocketDisconnect:
                logger.info(f"WebSocket disconnected for user {user_id}")
                break
            
            except Exception as e:
                logger.error(f"Error in WebSocket loop for user {user_id}: {e}")
                await websocket.send_text(f'{{"type": "error", "message": "Internal server error"}}')
                break
    
    except Exception as e:
        logger.error(f"WebSocket connection error for user {user_id}: {e}")
    
    finally:
        # Clean up connection
        manager.disconnect(websocket)


@router.get("/ws/stats")
async def get_websocket_stats():
    """
    Get WebSocket connection statistics.
    Useful for monitoring and debugging.
    """
    return {
        "active_connections": manager.get_connection_count(),
        "unique_users": manager.get_user_count(),
        "connection_details": [
            {
                "user_id": metadata["user_id"],
                "connected_at": metadata["connected_at"].isoformat(),
                "last_ping": metadata["last_ping"].isoformat(),
                "client_info": metadata.get("client_info", "Unknown")
            }
            for metadata in manager.connection_metadata.values()
        ]
    }


@router.post("/ws/notify/{user_id}")
async def send_notification_to_user(
    user_id: str,
    notification_type: str,
    title: str,
    message: str
):
    """
    Send a notification to a specific user via WebSocket.
    Useful for server-side triggered notifications.
    """
    try:
        await websocket_service.send_system_notification(
            user_id=user_id,
            title=title,
            message=message,
            notification_type=notification_type
        )
        return {"status": "success", "message": "Notification sent"}
        
    except Exception as e:
        logger.error(f"Failed to send notification to user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to send notification")


@router.post("/ws/broadcast")
async def broadcast_message(
    message_type: str,
    title: str,
    message: str
):
    """
    Broadcast a message to all connected users.
    Requires admin privileges in a real implementation.
    """
    try:
        if message_type == "maintenance":
            await websocket_service.broadcast_maintenance_notice(message)
        else:
            # Generic broadcast
            broadcast_data = {
                "type": "broadcast",
                "message_type": message_type,
                "title": title,
                "message": message
            }
            await manager.broadcast(broadcast_data)
        
        return {"status": "success", "message": "Broadcast sent"}
        
    except Exception as e:
        logger.error(f"Failed to broadcast message: {e}")
        raise HTTPException(status_code=500, detail="Failed to broadcast message")