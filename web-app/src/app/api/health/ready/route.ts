import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Quick readiness check - verify API is reachable
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    
    if (!apiUrl) {
      return NextResponse.json(
        { status: 'not_ready', message: 'API URL not configured' },
        { status: 503 }
      );
    }

    // Quick ping to API
    const response = await fetch(`${apiUrl}/health/live`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000) // 3 second timeout
    });

    if (!response.ok) {
      return NextResponse.json(
        { status: 'not_ready', message: 'API service not ready' },
        { status: 503 }
      );
    }

    return NextResponse.json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      service: 'web-app'
    });

  } catch (error) {
    return NextResponse.json(
      { 
        status: 'not_ready', 
        message: `Readiness check failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      },
      { status: 503 }
    );
  }
}