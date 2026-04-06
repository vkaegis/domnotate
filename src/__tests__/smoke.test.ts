import { describe, test, expect } from 'vitest';

import { createEventBus } from '@/events';
import { createAnnotationManager } from '@/annotations/annotation-manager';
import { createOutputFormatter } from '@/output/formatter';
import { serializeSession, deserializeSession, validateSession } from '@/output/json-io';
import { reanchorAnnotation } from '@/output/reanchor';
import { generateDescriptor, generateCssSelector, generateXPath } from '@/picker/selector-engine';
import { createNotePopover } from '@/popover/popover';
import { createToast } from '@/toast/toast';

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
  });
});
