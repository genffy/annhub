# Background Service Architecture

## Core Components

### 1. BackgroundServiceManager

- **File**: `background-service/index.ts`
- **Responsibility**: Register and initialize all services
- **Features**:
  - `whenReady()`: resolves once the services are ready; a failed initialization clears the cached promise so the next message retries
  - `dispatchMessage()`: forwards a message to the service handlers

### 2. ServiceManager

- **File**: `background-service/service-manager.ts`
- **Responsibility**: Manage the lifecycle of all services
- **Features**:
  - Service registration and initialization
  - Message dispatch: unknown types fail fast; `SAVE_CLIP` / `SAVE_SCREENSHOT` responses are cached by `requestId` so a retry after a lost response cannot save twice

### 3. EventHandlerManager

- **File**: `background-service/event-handlers/index.ts`
- **Responsibility**: Manage extension event listeners
- **Features**:
  - Register various event listeners
  - Unified error handling
  - Event listener lifecycle management

## Service worker start-up contract

MV3 service workers must register listeners in the synchronous top level. The
real `runtime.onMessage` listener lives in `entrypoints/background/index.ts`;
it answers immediately, awaits `whenReady()`, and only then dispatches. A
message that wakes a cold worker is therefore never dropped, and a first
operation costs one initialization (IndexedDB open), not a retry backoff.

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

1. **EntryService** - entries, properties, highlights, export (`services/entries`)
2. **ScreenshotService** - capture, image fetch, download, screenshot save (`services/screenshot`)
3. **SystemService** - settings and local metrics (`services/system`)

## Event Handlers

### 1. CommandHandler

- **Responsibility**: Handle shortcut commands
- **Events**: `browser.commands.onCommand`

### 2. InstallationHandler

- **Responsibility**: Handle installation and update events
- **Events**: `browser.runtime.onInstalled`
- **Features**:
  - Version migration
  - First installation handling

## Usage

```typescript
import backgroundServiceManager from '../../background-service'

export default defineBackground(() => {
  // listeners must be registered synchronously; see the contract above
  browser.runtime.onMessage.addListener(
    MessageUtils.wrapAsyncHandler(async (message, sender) => {
      await backgroundServiceManager.whenReady()
      return backgroundServiceManager.dispatchMessage(message, sender)
    }),
  )
  void backgroundServiceManager.whenReady()
})
```

## Extensibility

### Add new service

1. Create a new service in `background-service/services/` directory
2. Implement `IService` interface
3. Register in `BackgroundServiceManager.initialize()`
4. Update `SupportedServices` type definition

### Add new event handler

1. Create a new handler in `background-service/event-handlers/` directory
2. Register in `EventHandlerManager`
3. Implement `registerListeners()` and `removeListeners()` methods

## File structure

```
background-service/
├── index.ts                    # BackgroundServiceManager
├── service-manager.ts          # Service manager + message dispatch
├── README.md                   # This document
├── event-handlers/             # Event handlers
│   ├── index.ts
│   ├── command-handler.ts
│   └── installation-handler.ts
└── services/                   # All services
    ├── entries/
    ├── screenshot/
    └── system/
```
