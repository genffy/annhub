# Background Service Architecture

## Core Components

### 1. BackgroundServiceManager
- **File**: `background-service/index.ts`
- **Responsibility**: Manage all services and event handlers
- **Features**:
  - Initialize all background services
  - Register services and event listeners
  - Provide a unified status query interface

### 2. ServiceManager
- **File**: `background-service/service-manager.ts`
- **Responsibility**: Manage the lifecycle of all services
- **Features**:
  - Service registration and initialization
  - Message handler management
  - Service status monitoring

### 3. EventHandlerManager
- **File**: `background-service/event-handlers/index.ts`
- **Responsibility**: Manage all extension event listeners and handlers
- **Features**:
  - Register various event listeners
  - Unified error handling
  - Event listener lifecycle management

### 4. ServiceContext
- **File**: `background-service/service-context.ts`
- **Responsibility**: Manage service status and error information
- **Features**:
  - Service status tracking
  - Initialization progress monitoring
  - Detailed status information

## Service Architecture

### Service Interface (IService)
All services must implement the following interface:

```typescript
export interface IService {
  readonly name: SupportedServices
  initialize(): Promise<void>
  getMessageHandlers(): Record<string, MessageHandler>
  isInitialized(): boolean
  cleanup?(): Promise<void>
}
```

### Current Services

1. **ConfigService** - Configuration management service
2. **TranslationService** - Translation service
3. **HighlightService** - Highlight service

## Event Handlers

### 1. CommandHandler
- **Responsibility**: Handle shortcut commands
- **Events**: `browser.commands.onCommand`

### 2. RuntimeHandler
- **Responsibility**: Handle runtime events
- **Events**: 
  - PING message handling
  - Extension icon click
  - Browser startup

### 3. InstallationHandler
- **Responsibility**: Handle installation and update events
- **Events**: `browser.runtime.onInstalled`
- **Features**:
  - Version migration
  - First installation handling

## Usage

### Using in background script

```typescript
import backgroundServiceManager from '../../background-service'

export default defineBackground(() => {
  // initialize all services
  backgroundServiceManager.initialize().catch(error => {
    console.error('Failed to initialize services:', error)
  })
})
```

### Get specific service

```typescript
import { ConfigService, TranslationService } from '../../background-service'

// get configuration service instance
const configService = ConfigService.getInstance()

// get translation service instance
const translationService = TranslationService.getInstance()
```

### Check service status

```typescript
import backgroundServiceManager from '../../background-service'

// get overall status
const status = backgroundServiceManager.getStatus()

// check if ready
const isReady = backgroundServiceManager.isReady()
```

## Extensibility

### Add new service

1. Create a new service in `background-service/services/` directory
2. Implement `IService` interface
3. Register in `BackgroundServiceManager.registerServices()`
4. Update `SupportedServices` type definition

### Add new event handler

1. Create a new handler in `background-service/event-handlers/` directory
2. Register in `EventHandlerManager`
3. Implement `registerListeners()` and `removeListeners()` methods

## Advantages

1. **Modular**: Each component has a single responsibility, making it easy to maintain
2. **Extensible**: New services and event handlers are easy to add
3. **Unified management**: All initialization and event handling is managed in one place
4. **Error handling**: Unified error handling and status management
5. **Type safety**: Complete TypeScript type definitions
6. **Backward compatibility**: Maintain backward compatibility with existing APIs

## File structure

```
background-service/
├── index.ts                    # Main export file
├── service-manager.ts          # Service manager
├── service-context.ts          # Service context
├── README.md                   # This document
├── event-handlers/             # Event handlers
│   ├── index.ts
│   ├── command-handler.ts
│   ├── runtime-handler.ts
│   └── installation-handler.ts
└── services/                   # All services
    ├── config/
    ├── translation/
    └── highlight/
``` 