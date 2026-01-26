export const ANN_SELECTION_KEY = 'capture-selection'

export const APP_CONFIG = {
    name: 'ANN - Advanced Text Toolkit',
    version: '0.1.0',
    description: 'Multi-functional text selection toolkit',

    features: {
        translation: true,
        notes: true,
        sharing: true,
        screenshot: true
    },

    ui: {
        toolbar: {
            maxWidth: 300,
            buttonSize: 32,
            borderRadius: 8,
            animationDuration: 200
        },
        popup: {
            maxWidth: 400,
            maxHeight: 300,
            offset: 10
        }
    }
} as const

export const TRANSLATION_CONFIG = {
    providers: {
        google: {
            name: 'Google Translate',
            free: true,
            apiRequired: false
        },
        baidu: {
            name: 'Baidu Translate',
            free: false,
            apiRequired: true
        },
        youdao: {
            name: 'Youdao Translate',
            free: false,
            apiRequired: true
        }
    },
    defaultProvider: 'google',
    maxTextLength: 500,
    minTextLength: 1
} as const

export const NOTES_CONFIG = {
    maxSummaryLength: 200,
    maxCommentLength: 1000,
    storageKey: 'ann-notes-data',

    summary: {
        enabled: true,
        maxLength: 100,
        minLength: 20
    },

    database: {
        name: 'ann-notes-db',
        version: 1,
        stores: {
            notes: 'notes',
            settings: 'settings'
        }
    },

    highlighting: {
        enabled: true,
        className: 'ann-note-highlight',
        maxMatchDistance: 50,
        checkInterval: 1000
    }
} as const

export const SHARING_CONFIG = {
    screenshot: {
        format: 'png' as const,
        quality: 0.9,
        expandPadding: 20,
        maxWidth: 1920,
        maxHeight: 1080
    },

    editor: {
        tools: ['brush', 'text', 'blur', 'arrow'] as const,
        brushSizes: [2, 4, 6, 8, 10],
        colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#000000', '#ffffff']
    },

    channels: {
        download: { enabled: true, format: 'png' },
        twitter: { enabled: true, maxFileSize: 5 * 1024 * 1024 }, // 5MB
        clipboard: { enabled: true }
    }
} as const

export const SHORTCUTS_CONFIG = {
    capture: {
        default: 'Ctrl+Shift+S',
        mac: 'Command+Shift+S'
    },

    content: {
        hideToolbar: 'Escape',
        nextFeature: 'Tab',
        prevFeature: 'Shift+Tab'
    }
} as const

export const STORAGE_CONFIG = {
    keys: {
        settings: 'ann-settings',
        notes: 'ann-notes',
        cache: 'ann-cache',
        whitelist: 'ann-whitelist'
    },

    expiry: {
        cache: 24 * 60 * 60 * 1000,
        notes: 30 * 24 * 60 * 60 * 1000,
        settings: Infinity
    }
} as const

export const EVENT_TYPES = {
    CONTENT_READY: 'content:ready',
    TEXT_SELECTED: 'content:text-selected',
    TOOLBAR_SHOW: 'content:toolbar-show',
    TOOLBAR_HIDE: 'content:toolbar-hide',

    TRANSLATE_START: 'feature:translate-start',
    TRANSLATE_COMPLETE: 'feature:translate-complete',
    NOTES_SAVE: 'feature:notes-save',
    SHARING_CAPTURE: 'feature:sharing-capture',

    SETTINGS_CHANGED: 'settings:changed',
    WHITELIST_UPDATED: 'settings:whitelist-updated'
} as const

export const ERROR_TYPES = {
    NETWORK_ERROR: 'network_error',
    API_ERROR: 'api_error',
    PERMISSION_ERROR: 'permission_error',
    VALIDATION_ERROR: 'validation_error',
    UNKNOWN_ERROR: 'unknown_error'
} as const

export const CSS_CLASSES = {
    toolbar: 'ann-toolbar',
    toolbarButton: 'ann-toolbar-button',
    toolbarActive: 'ann-toolbar-active',

    popup: 'ann-popup',
    popupOverlay: 'ann-popup-overlay',
    popupContent: 'ann-popup-content',

    translation: 'ann-translation',
    notes: 'ann-notes',
    sharing: 'ann-sharing',

    loading: 'ann-loading',
    error: 'ann-error',
    success: 'ann-success'
} as const

export const Z_INDEXES = {
    toolbar: 999999,
    popup: 1000000,
    overlay: 1000001,
    editor: 1000002
} as const

export const NOTE_TYPES = {
    MANUAL: 'manual',
    AUTO: 'auto'
} as const

export const NOTE_STATUS = {
    ACTIVE: 'active',
    ARCHIVED: 'archived',
    DELETED: 'deleted'
} as const

export const MATCH_ALGORITHMS = {
    EXACT: 'exact',
    FUZZY: 'fuzzy',
    CONTEXT: 'context'
} as const 