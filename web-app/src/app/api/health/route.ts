import { NextResponse } from 'next/server';

interface HealthCheck {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  service: string;
  version: string;
  environment: string;
  checks: {
    [key: string]: {
      status: 'healthy' | 'unhealthy';
      message: string;
      response_time_ms?: number;
    };
  };
  metrics?: {
    [key: string]: any;
  };
}

export async function GET() {
  const startTime = Date.now();
  
  const health: HealthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'web-app',
    version: process.env.NEXT_PUBLIC_APP_VERSION || '2.0.0',
    environment: process.env.NODE_ENV || 'development',
    checks: {},
    metrics: {}
  };

  // Check API connectivity
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (apiUrl) {
      const apiStartTime = Date.now();
      const response = await fetch(`${apiUrl}/health/live`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Add timeout
        signal: AbortSignal.timeout(5000)
      });
      
      const apiResponseTime = Date.now() - apiStartTime;
      
      if (response.ok) {
        health.checks.api_connectivity = {
          status: 'healthy',
          message: 'API service is reachable',
          response_time_ms: apiResponseTime
        };
      } else {
        health.checks.api_connectivity = {
          status: 'unhealthy',
          message: `API service returned ${response.status}`,
          response_time_ms: apiResponseTime
        };
        health.status = 'unhealthy';
      }
    } else {
      health.checks.api_connectivity = {
        status: 'unhealthy',
        message: 'API URL not configured'
      };
      health.status = 'unhealthy';
    }
  } catch (error) {
    health.checks.api_connectivity = {
      status: 'unhealthy',
      message: `API connectivity failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
    health.status = 'unhealthy';
  }

  // Check environment variables
  const requiredEnvVars = [
    'NEXT_PUBLIC_API_URL',
    'NEXT_PUBLIC_MICROSOFT_CLIENT_ID',
    'NEXT_PUBLIC_MICROSOFT_TENANT_ID'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    health.checks.environment = {
      status: 'unhealthy',
      message: `Missing required environment variables: ${missingVars.join(', ')}`
    };
    health.status = 'unhealthy';
  } else {
    health.checks.environment = {
      status: 'healthy',
      message: 'All required environment variables present'
    };
  }

  // Add performance metrics
  health.metrics = {
    total_response_time_ms: Date.now() - startTime,
    memory_usage: process.memoryUsage(),
    uptime_seconds: process.uptime(),
    node_version: process.version
  };

  // Return appropriate status code
  const statusCode = health.status === 'healthy' ? 200 : 503;
  
  return NextResponse.json(health, { status: statusCode });
}