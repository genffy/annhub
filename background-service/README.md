# Background Service Architecture

Components and responsibilities at a glance. The message-facade, sender and
start-up rules live in [AGENTS.md](AGENTS.md).

## Core Components

1. **BackgroundServiceManager** — `background-service/index.ts`: registers and initializes all services
2. **ServiceManager** — `background-service/service-manager.ts`: service lifecycle and message dispatch
3. **EventHandlerManager** — `background-service/event-handlers/index.ts`: extension event listeners, unified error handling

## Services

1. **EntryService** — entries, properties, highlights and queries (`services/entries`); the export ZIP is built in the library page, not here
2. **ScreenshotService** — capture, image fetch, download, screenshot save (`services/screenshot`)
3. **RecordingService** — tab-recording state machine, toolbar badge and the finished video's download (`services/recording`); the video itself is assembled by the offscreen recording document (`entrypoints/offscreen`)
4. **DownloadService** — page and library Markdown downloads (`services/download`); coordinates one global download, file naming, cancellation, recovery and metrics, with extraction and media packing in the offscreen document
5. **SystemService** — settings and local metrics (`services/system`)

Shared domain rules, IndexedDB access, Markdown conversion helpers and export formatting live in [core](../core/AGENTS.md). The worker uses `store-instance.ts` to share one database connection; library and offscreen pages also use the core for asset reads and packing.

## Event Handlers

1. **CommandHandler** — shortcut commands (`browser.commands.onCommand`); page actions go to the top frame only (`frameId: 0`), while recording is handled in the worker
2. **InstallationHandler** — installation and update events (`browser.runtime.onInstalled`)

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
├── store-instance.ts           # Shared worker database connection
├── README.md                   # This document
├── event-handlers/             # Event handlers
│   ├── index.ts
│   ├── command-handler.ts
│   └── installation-handler.ts
└── services/                   # All services
    ├── download/
    ├── entries/
    ├── metrics/
    ├── recording/
    ├── screenshot/
    └── system/
```
