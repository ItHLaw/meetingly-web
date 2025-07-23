"""
Performance monitoring and alerting service
"""

import asyncio
import json
import logging
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from enum import Enum

import psutil
import redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session, get_redis_client


logger = logging.getLogger(__name__)


class AlertLevel(Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class MetricType(Enum):
    COUNTER = "counter"
    GAUGE = "gauge"
    HISTOGRAM = "histogram"
    TIMER = "timer"


@dataclass
class Metric:
    name: str
    value: float
    timestamp: float
    tags: Dict[str, str] = None
    metric_type: MetricType = MetricType.GAUGE
    unit: str = None

    def __post_init__(self):
        if self.tags is None:
            self.tags = {}
        if self.timestamp is None:
            self.timestamp = time.time()


@dataclass
class Alert:
    id: str
    level: AlertLevel
    message: str
    metric_name: str
    current_value: float
    threshold: float
    timestamp: float
    resolved: bool = False
    resolution_time: Optional[float] = None


@dataclass
class PerformanceThreshold:
    metric_name: str
    warning_threshold: float
    critical_threshold: float
    comparison: str = "gt"  # gt, lt, eq
    duration_minutes: int = 5  # Alert if threshold breached for this duration
    enabled: bool = True


class PerformanceMonitor:
    """
    Comprehensive performance monitoring system
    """
    
    def __init__(self):
        self.metrics_buffer: List[Metric] = []
        self.alerts: List[Alert] = []
        self.thresholds: List[PerformanceThreshold] = self._get_default_thresholds()
        self.redis_client = None
        self.monitoring_enabled = True
        self.buffer_size = 1000
        self.flush_interval = 30  # seconds
        
    async def initialize(self):
        """Initialize monitoring components"""
        try:
            self.redis_client = await get_redis_client()
            await self._setup_metric_storage()
            logger.info("Performance monitoring initialized")
        except Exception as e:
            logger.error(f"Failed to initialize performance monitoring: {e}")
            
    async def record_metric(
        self,
        name: str,
        value: float,
        tags: Dict[str, str] = None,
        metric_type: MetricType = MetricType.GAUGE,
        unit: str = None
    ):
        """Record a performance metric"""
        if not self.monitoring_enabled:
            return
            
        metric = Metric(
            name=name,
            value=value,
            timestamp=time.time(),
            tags=tags or {},
            metric_type=metric_type,
            unit=unit
        )
        
        self.metrics_buffer.append(metric)
        
        # Check thresholds
        await self._check_thresholds(metric)
        
        # Flush if buffer is full
        if len(self.metrics_buffer) >= self.buffer_size:
            await self.flush_metrics()
    
    async def record_api_metrics(
        self,
        method: str,
        endpoint: str,
        status_code: int,
        duration_ms: float,
        response_size: int = None
    ):
        """Record API performance metrics"""
        tags = {
            "method": method,
            "endpoint": self._sanitize_endpoint(endpoint),
            "status_code": str(status_code),
            "status_class": self._get_status_class(status_code)
        }
        
        await self.record_metric("api.request.duration", duration_ms, tags, MetricType.TIMER, "ms")
        await self.record_metric("api.request.count", 1, tags, MetricType.COUNTER)
        
        if response_size:
            await self.record_metric("api.response.size", response_size, tags, MetricType.HISTOGRAM, "bytes")
    
    async def record_database_metrics(self, query_type: str, duration_ms: float, rows_affected: int = None):
        """Record database performance metrics"""
        tags = {"query_type": query_type}
        
        await self.record_metric("db.query.duration", duration_ms, tags, MetricType.TIMER, "ms")
        await self.record_metric("db.query.count", 1, tags, MetricType.COUNTER)
        
        if rows_affected is not None:
            await self.record_metric("db.rows.affected", rows_affected, tags, MetricType.GAUGE)
    
    async def record_processing_metrics(
        self,
        job_type: str,
        duration_ms: float,
        success: bool,
        file_size: int = None
    ):
        """Record background processing metrics"""
        tags = {
            "job_type": job_type,
            "success": str(success).lower()
        }
        
        await self.record_metric("processing.job.duration", duration_ms, tags, MetricType.TIMER, "ms")
        await self.record_metric("processing.job.count", 1, tags, MetricType.COUNTER)
        
        if file_size:
            await self.record_metric("processing.file.size", file_size, tags, MetricType.HISTOGRAM, "bytes")
    
    async def record_system_metrics(self):
        """Record system-level metrics"""
        try:
            # CPU metrics
            cpu_percent = psutil.cpu_percent(interval=1)
            await self.record_metric("system.cpu.usage", cpu_percent, unit="percent")
            
            # Memory metrics
            memory = psutil.virtual_memory()
            await self.record_metric("system.memory.usage", memory.percent, unit="percent")
            await self.record_metric("system.memory.available", memory.available, unit="bytes")
            await self.record_metric("system.memory.used", memory.used, unit="bytes")
            
            # Disk metrics
            disk = psutil.disk_usage('/')
            await self.record_metric("system.disk.usage", disk.percent, unit="percent")
            await self.record_metric("system.disk.free", disk.free, unit="bytes")
            
            # Network metrics
            network = psutil.net_io_counters()
            await self.record_metric("system.network.bytes_sent", network.bytes_sent, unit="bytes")
            await self.record_metric("system.network.bytes_recv", network.bytes_recv, unit="bytes")
            
        except Exception as e:
            logger.error(f"Failed to record system metrics: {e}")
    
    async def record_database_connection_metrics(self):
        """Record database connection pool metrics"""
        try:
            async with get_async_session() as session:
                # Check connection pool status
                pool = session.bind.pool
                
                await self.record_metric("db.pool.size", pool.size())
                await self.record_metric("db.pool.checked_in", pool.checkedin())
                await self.record_metric("db.pool.checked_out", pool.checkedout())
                await self.record_metric("db.pool.overflow", pool.overflow())
                
                # Test query performance
                start_time = time.time()
                await session.execute(text("SELECT 1"))
                query_duration = (time.time() - start_time) * 1000
                
                await self.record_metric("db.health.ping", query_duration, unit="ms")
                
        except Exception as e:
            logger.error(f"Failed to record database metrics: {e}")
            await self.record_metric("db.health.error", 1, {"error": str(e)[:100]}, MetricType.COUNTER)
    
    async def record_redis_metrics(self):
        """Record Redis performance metrics"""
        try:
            if not self.redis_client:
                return
                
            # Get Redis info
            info = await self.redis_client.info()
            
            await self.record_metric("redis.connected_clients", info.get("connected_clients", 0))
            await self.record_metric("redis.used_memory", info.get("used_memory", 0), unit="bytes")
            await self.record_metric("redis.total_commands_processed", info.get("total_commands_processed", 0))
            
            # Test Redis performance
            start_time = time.time()
            await self.redis_client.ping()
            ping_duration = (time.time() - start_time) * 1000
            
            await self.record_metric("redis.health.ping", ping_duration, unit="ms")
            
        except Exception as e:
            logger.error(f"Failed to record Redis metrics: {e}")
            await self.record_metric("redis.health.error", 1, {"error": str(e)[:100]}, MetricType.COUNTER)
    
    async def get_metrics_summary(self, hours: int = 24) -> Dict[str, Any]:
        """Get performance metrics summary"""
        try:
            if not self.redis_client:
                return {}
                
            since_timestamp = time.time() - (hours * 3600)
            
            # Get metrics from Redis
            metrics_keys = await self.redis_client.keys(f"metrics:*:{since_timestamp:.0f}:*")
            
            summary = {
                "total_metrics": len(metrics_keys),
                "time_range_hours": hours,
                "categories": {},
                "alerts": len([a for a in self.alerts if not a.resolved]),
                "system_health": await self._get_system_health()
            }
            
            # Categorize metrics
            for key in metrics_keys:
                metric_data = await self.redis_client.get(key)
                if metric_data:
                    metric = json.loads(metric_data)
                    category = metric["name"].split(".")[0]
                    if category not in summary["categories"]:
                        summary["categories"][category] = 0
                    summary["categories"][category] += 1
            
            return summary
            
        except Exception as e:
            logger.error(f"Failed to get metrics summary: {e}")
            return {"error": str(e)}
    
    async def get_active_alerts(self) -> List[Dict[str, Any]]:
        """Get currently active alerts"""
        active_alerts = [a for a in self.alerts if not a.resolved]
        return [asdict(alert) for alert in active_alerts]
    
    async def flush_metrics(self):
        """Flush metrics to storage"""
        if not self.metrics_buffer:
            return
            
        try:
            # Store metrics in Redis with TTL
            if self.redis_client:
                for metric in self.metrics_buffer:
                    key = f"metrics:{metric.name}:{metric.timestamp:.0f}:{hash(str(metric.tags))}"
                    value = json.dumps(asdict(metric))
                    await self.redis_client.setex(key, 86400 * 7, value)  # 7 days TTL
            
            logger.debug(f"Flushed {len(self.metrics_buffer)} metrics")
            self.metrics_buffer.clear()
            
        except Exception as e:
            logger.error(f"Failed to flush metrics: {e}")
    
    async def _check_thresholds(self, metric: Metric):
        """Check if metric breaches any thresholds"""
        for threshold in self.thresholds:
            if threshold.metric_name != metric.name or not threshold.enabled:
                continue
                
            # Check if threshold is breached
            breached = False
            threshold_value = None
            level = None
            
            if threshold.comparison == "gt":
                if metric.value > threshold.critical_threshold:
                    breached = True
                    threshold_value = threshold.critical_threshold
                    level = AlertLevel.CRITICAL
                elif metric.value > threshold.warning_threshold:
                    breached = True
                    threshold_value = threshold.warning_threshold
                    level = AlertLevel.WARNING
            elif threshold.comparison == "lt":
                if metric.value < threshold.critical_threshold:
                    breached = True
                    threshold_value = threshold.critical_threshold
                    level = AlertLevel.CRITICAL
                elif metric.value < threshold.warning_threshold:
                    breached = True
                    threshold_value = threshold.warning_threshold
                    level = AlertLevel.WARNING
            
            if breached:
                await self._create_alert(metric, threshold_value, level)
    
    async def _create_alert(self, metric: Metric, threshold: float, level: AlertLevel):
        """Create a new alert"""
        alert_id = f"{metric.name}:{level.value}:{int(metric.timestamp)}"
        
        # Check if alert already exists
        existing_alert = next((a for a in self.alerts if a.id == alert_id and not a.resolved), None)
        if existing_alert:
            return
        
        alert = Alert(
            id=alert_id,
            level=level,
            message=f"{metric.name} is {metric.value} (threshold: {threshold})",
            metric_name=metric.name,
            current_value=metric.value,
            threshold=threshold,
            timestamp=metric.timestamp
        )
        
        self.alerts.append(alert)
        logger.warning(f"Alert created: {alert.message}")
        
        # Send notification (implement based on your notification system)
        await self._send_alert_notification(alert)
    
    async def _send_alert_notification(self, alert: Alert):
        """Send alert notification"""
        # Implement your notification logic here (email, Slack, etc.)
        # For now, just log the alert
        logger.warning(f"ALERT [{alert.level.value.upper()}]: {alert.message}")
    
    async def _setup_metric_storage(self):
        """Setup metric storage backend"""
        if self.redis_client:
            # Test Redis connection
            await self.redis_client.ping()
            logger.info("Metrics storage (Redis) connected")
    
    async def _get_system_health(self) -> Dict[str, str]:
        """Get overall system health status"""
        health = {
            "status": "healthy",
            "cpu": "good",
            "memory": "good",
            "disk": "good",
            "database": "good",
            "redis": "good"
        }
        
        try:
            # Check CPU
            cpu_percent = psutil.cpu_percent()
            if cpu_percent > 90:
                health["cpu"] = "critical"
                health["status"] = "degraded"
            elif cpu_percent > 70:
                health["cpu"] = "warning"
                if health["status"] == "healthy":
                    health["status"] = "degraded"
            
            # Check memory
            memory_percent = psutil.virtual_memory().percent
            if memory_percent > 90:
                health["memory"] = "critical"
                health["status"] = "degraded"
            elif memory_percent > 80:
                health["memory"] = "warning"
                if health["status"] == "healthy":
                    health["status"] = "degraded"
            
            # Check disk
            disk_percent = psutil.disk_usage('/').percent
            if disk_percent > 95:
                health["disk"] = "critical"
                health["status"] = "degraded"
            elif disk_percent > 85:
                health["disk"] = "warning"
                if health["status"] == "healthy":
                    health["status"] = "degraded"
            
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            health["status"] = "unknown"
        
        return health
    
    def _get_default_thresholds(self) -> List[PerformanceThreshold]:
        """Get default performance thresholds"""
        return [
            # System metrics
            PerformanceThreshold("system.cpu.usage", 70, 90, "gt"),
            PerformanceThreshold("system.memory.usage", 80, 95, "gt"),
            PerformanceThreshold("system.disk.usage", 85, 95, "gt"),
            
            # API metrics
            PerformanceThreshold("api.request.duration", 1000, 5000, "gt"),
            
            # Database metrics
            PerformanceThreshold("db.query.duration", 500, 2000, "gt"),
            PerformanceThreshold("db.health.ping", 100, 500, "gt"),
            
            # Redis metrics
            PerformanceThreshold("redis.health.ping", 50, 200, "gt"),
            
            # Processing metrics
            PerformanceThreshold("processing.job.duration", 60000, 300000, "gt"),  # 1min, 5min
        ]
    
    @staticmethod
    def _sanitize_endpoint(endpoint: str) -> str:
        """Sanitize endpoint for metrics"""
        # Remove UUIDs and IDs
        import re
        endpoint = re.sub(r'/[0-9a-f-]{36}', '/[id]', endpoint)
        endpoint = re.sub(r'/\d+', '/[id]', endpoint)
        return endpoint
    
    @staticmethod
    def _get_status_class(status_code: int) -> str:
        """Get status code class"""
        if 200 <= status_code < 300:
            return "2xx"
        elif 300 <= status_code < 400:
            return "3xx"
        elif 400 <= status_code < 500:
            return "4xx"
        elif 500 <= status_code:
            return "5xx"
        return "unknown"


# Global instance
performance_monitor = PerformanceMonitor()


async def start_monitoring():
    """Start the performance monitoring system"""
    await performance_monitor.initialize()
    
    # Start background tasks
    asyncio.create_task(periodic_system_metrics())
    asyncio.create_task(periodic_metric_flush())
    
    logger.info("Performance monitoring started")


async def periodic_system_metrics():
    """Periodically collect system metrics"""
    while performance_monitor.monitoring_enabled:
        try:
            await performance_monitor.record_system_metrics()
            await performance_monitor.record_database_connection_metrics()
            await performance_monitor.record_redis_metrics()
        except Exception as e:
            logger.error(f"Error collecting system metrics: {e}")
        
        await asyncio.sleep(60)  # Every minute


async def periodic_metric_flush():
    """Periodically flush metrics"""
    while performance_monitor.monitoring_enabled:
        try:
            await performance_monitor.flush_metrics()
        except Exception as e:
            logger.error(f"Error flushing metrics: {e}")
        
        await asyncio.sleep(performance_monitor.flush_interval)