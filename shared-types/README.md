# @meetingly/shared-types

Shared TypeScript type definitions for the Meetingly application ecosystem.

## Overview

This package contains all shared type definitions used across the Meetingly frontend and backend applications to ensure type consistency and prevent duplication.

## Installation

```bash
npm install @meetingly/shared-types
```

## Usage

```typescript
import { 
  User, 
  Meeting, 
  AudioUploadRequest, 
  SummaryData,
  WebSocketMessage 
} from '@meetingly/shared-types';

// Use the types in your application
const user: User = {
  id: '123',
  email: 'user@example.com',
  name: 'John Doe',
  // ... other properties
};
```

## Type Categories

### Authentication (`auth.ts`)
- User profiles and preferences
- Authentication tokens and context
- JWT payloads and session data

### Meetings (`meetings.ts`)
- Meeting entities and metadata
- Transcript segments
- Processing events and filters

### Audio Processing (`audio.ts`)
- Audio upload and processing
- Transcription results
- Whisper model configurations

### Summary Generation (`summary.ts`)
- AI-powered summary types
- Structured summary formats
- Provider configurations

### API Communication (`api.ts`)
- Request/response formats
- Pagination and filtering
- Batch operations and exports

### WebSocket Events (`websocket.ts`)
- Real-time event types
- Connection management
- Processing updates

### Error Handling (`errors.ts`)
- Error categories and codes
- Error reporting and handling
- Retry policies

### Common Types (`common.ts`)
- Base entities and utilities
- Pagination and sorting
- Health checks and metrics

## Development

### Building

```bash
npm run build
```

### Watching for changes

```bash
npm run build:watch
```

### Linting

```bash
npm run lint
npm run lint:fix
```

## Type Safety Guidelines

1. **Always use shared types** for data that crosses application boundaries
2. **Extend base interfaces** rather than duplicating common fields
3. **Use enums for string literals** to ensure consistency
4. **Document complex types** with JSDoc comments
5. **Version breaking changes** appropriately

## Versioning

This package follows semantic versioning:
- **Patch**: Bug fixes, non-breaking additions
- **Minor**: New types, optional fields
- **Major**: Breaking changes, removed types

## Contributing

1. Add new types in the appropriate category file
2. Export new types from `index.ts`
3. Update this README if adding new categories
4. Ensure all types are properly documented
5. Run tests and linting before submitting

## Integration

This package is designed to be used in:
- **Frontend**: React/Next.js application (`/web-app`)
- **Backend**: FastAPI application (`/api`)
- **Desktop**: Tauri application (`/frontend`)

Each application should import only the types it needs to minimize bundle size.