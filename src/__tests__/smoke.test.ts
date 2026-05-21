import { describe, test, expect } from 'vitest';

import { createEventBus } from '@/events';
import { createAnnotationManager } from '@/annotations/annotation-manager';
import { createOutputFormatter } from '@/output/formatter';
import { serializeSession, deserializeSession, validateSession } from '@/output/json-io';
import { reanchorAnnotation } from '@/output/reanchor';
import { generateDescriptor, generateCssSelector, generateXPath } from '@/picker/selector-engine';
import { createNotePopover } from '@/popover/popover';
import { createToast } from '@/toast/toast';
import { createSlideObserver } from '@/slides/slide-observer';
import { activateScopeRecord, ACTIVATION_STRATEGIES } from '@/slides/activation-strategy';
import { createKeyboardShortcuts } from '@/keyboard/shortcuts';
import { createContentLoader } from '@/loader/loader';
import { fetchShare, publishShare, republishAnnotations } from '@/share/share-client';
import { sessionFromSharedBlob } from '@/share/hydration';
import { createSharedSessionBlob } from '@/share/shared-session';
import {
  describePinVisibility,
  generateScopeDiagnostics,
  isElementSuspiciouslyUnscoped,
} from '@/diagnostics/scope-diagnostics';
import { scopeAnnotationToCurrentPanel } from '@/diagnostics/scope-override';
import { isDiagnosticsEnabled, mountDiagnosticsPanel } from '@/diagnostics/diagnostics-panel';

describe('smoke: core module exports', () => {
  test('all core modules export expected functions', () => {
    expect(typeof createEventBus).toBe('function');
    expect(typeof createAnnotationManager).toBe('function');
    expect(typeof createOutputFormatter).toBe('function');
    expect(typeof serializeSession).toBe('function');
    expect(typeof deserializeSession).toBe('function');
    expect(typeof validateSession).toBe('function');
    expect(typeof reanchorAnnotation).toBe('function');
    expect(typeof generateDescriptor).toBe('function');
    expect(typeof generateCssSelector).toBe('function');
    expect(typeof generateXPath).toBe('function');
    expect(typeof createNotePopover).toBe('function');
    expect(typeof createToast).toBe('function');
    expect(typeof createSlideObserver).toBe('function');
    expect(typeof activateScopeRecord).toBe('function');
    expect(Array.isArray(ACTIVATION_STRATEGIES)).toBe(true);
    expect(typeof createKeyboardShortcuts).toBe('function');
    expect(typeof createContentLoader).toBe('function');
    expect(typeof publishShare).toBe('function');
    expect(typeof fetchShare).toBe('function');
    expect(typeof republishAnnotations).toBe('function');
    expect(typeof sessionFromSharedBlob).toBe('function');
    expect(typeof createSharedSessionBlob).toBe('function');
    expect(typeof generateScopeDiagnostics).toBe('function');
    expect(typeof describePinVisibility).toBe('function');
    expect(typeof isElementSuspiciouslyUnscoped).toBe('function');
    expect(typeof scopeAnnotationToCurrentPanel).toBe('function');
    expect(typeof isDiagnosticsEnabled).toBe('function');
    expect(typeof mountDiagnosticsPanel).toBe('function');
  });
});
