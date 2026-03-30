import { createEventBus } from '@/events';
import type { AppMode, AnnotationSession } from '@/types/core';

// TODO: Phase 1 module imports will be added during integration
// import { createContentLoader } from '@/loader/loader';
// import { createElementPicker } from '@/picker/picker';
// import { createAnnotationManager } from '@/annotations/annotation-manager';
// import { createPinRenderer } from '@/annotations/pin-renderer';
// import { createToolbar } from '@/toolbar/toolbar';
// import { createOutputFormatter } from '@/output/formatter';
// import { createSessionStore } from '@/output/store';

const bus = createEventBus();

// DOM refs
const _dropZoneEl = document.getElementById('drop-zone')!;
const _contentAreaEl = document.getElementById('content-area')!;
const _iframeEl = document.getElementById('content-frame') as HTMLIFrameElement;
const _overlayEl = document.getElementById('overlay')!;
const _toolbarEl = document.getElementById('toolbar')!;

// App state
let _currentMode: AppMode = 'browse';
let _currentSession: AnnotationSession | null = null;

// Suppress unused variable warnings until integration
void _dropZoneEl;
void _contentAreaEl;
void _iframeEl;
void _overlayEl;
void _toolbarEl;
void _currentMode;
void _currentSession;

// TODO: Phase 2 integration
// - Init content loader with iframe + drop zone
// - On content:loaded → init picker, pin renderer, show toolbar
// - On picker:select → create annotation via manager
// - On mode:change → activate/deactivate picker
// - On annotation events → auto-save session to store
// - On output:copy → format + clipboard
// - On output:download → format + download

console.log('[Domnotate] Ready — awaiting module integration');
