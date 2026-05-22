import { describe, test, expect } from 'vitest';
import { serializeSession, deserializeSession, validateSession } from '@/output/json-io';
import { makeSession, makeAnnotation, makeViewScope } from '@/__tests__/fixtures';

describe('json-io', () => {
  describe('validateSession', () => {
    test('accepts a valid session', () => {
      const session = makeSession({ annotations: [makeAnnotation()] });
      expect(validateSession(session)).toBe(true);
    });

    test('accepts session with empty annotations array', () => {
      const session = makeSession();
      expect(validateSession(session)).toBe(true);
    });

    test('rejects null', () => {
      expect(validateSession(null)).toBe(false);
    });

    test('rejects non-object', () => {
      expect(validateSession('string')).toBe(false);
      expect(validateSession(42)).toBe(false);
    });

    test('rejects missing id', () => {
      const session = makeSession();
      const { id: _, ...noId } = session;
      expect(validateSession(noId)).toBe(false);
    });

    test('rejects missing annotations array', () => {
      const session = makeSession();
      const { annotations: _, ...noAnns } = session;
      expect(validateSession(noAnns)).toBe(false);
    });

    test('rejects bad sourceType', () => {
      const session = makeSession();
      expect(validateSession({ ...session, sourceType: 'ftp' })).toBe(false);
    });

    test('rejects annotation with missing text', () => {
      const ann = makeAnnotation();
      const { text: _, ...noText } = ann;
      const session = makeSession({ annotations: [noText as any] });
      expect(validateSession(session)).toBe(false);
    });

    test('rejects annotation with bad anchorPoint', () => {
      const ann = makeAnnotation();
      const session = makeSession({ annotations: [{ ...ann, anchorPoint: { x: 'bad', y: 0 } } as any] });
      expect(validateSession(session)).toBe(false);
    });

    test('accepts old JSON annotations without viewScope', () => {
      const annotation = makeAnnotation({ slideIndex: 2 });
      const { viewScope: _, ...legacyAnnotation } = annotation;
      const session = makeSession({ annotations: [legacyAnnotation] });

      expect(validateSession(session)).toBe(true);
      expect(deserializeSession(JSON.stringify(session)).annotations[0].viewScope).toBeUndefined();
    });

    test('accepts mixed JSON with legacy slideIndex-only annotations', () => {
      const legacySlideAnnotation = makeAnnotation({ slideIndex: 1 });
      const { viewScope: _, ...legacyOnly } = legacySlideAnnotation;
      const scopedAnnotation = makeAnnotation({
        viewScope: makeViewScope({
          kind: 'tabpanel',
          id: 'why-now',
          index: 0,
          label: 'Why now',
          selector: '#why-now',
        }),
      });
      const session = makeSession({ annotations: [legacyOnly, scopedAnnotation] });

      expect(validateSession(session)).toBe(true);
      const restored = deserializeSession(JSON.stringify(session));
      expect(restored.annotations[0].slideIndex).toBe(1);
      expect(restored.annotations[0].viewScope).toBeUndefined();
      expect(restored.annotations[1].viewScope?.label).toBe('Why now');
    });

    test('accepts valid annotation viewScope', () => {
      const viewScope = makeViewScope({
        kind: 'tabpanel',
        id: 'why-now',
        index: 1,
        label: 'Why now',
        selector: '#why-now',
        controllerSelector: '[aria-controls="why-now"]',
        activation: 'click-controller',
      });
      const session = makeSession({
        annotations: [makeAnnotation({ viewScope })],
      });

      expect(validateSession(session)).toBe(true);
      expect(deserializeSession(JSON.stringify(session)).annotations[0].viewScope).toEqual(viewScope);
    });

    test('rejects malformed annotation viewScope', () => {
      const annotation = makeAnnotation({
        viewScope: {
          kind: 'tabpanel',
          id: 'why-now',
          index: 1,
          label: 'Why now',
          activation: 'click-controller',
        } as any,
      });
      const session = makeSession({ annotations: [annotation] });

      expect(validateSession(session)).toBe(false);
      expect(() => deserializeSession(JSON.stringify(session))).toThrow('Invalid session JSON');
    });

    test('rejects annotation with missing element fields', () => {
      const ann = makeAnnotation();
      const session = makeSession({
        annotations: [{ ...ann, element: { ...ann.element, cssSelector: 123 } } as any],
      });
      expect(validateSession(session)).toBe(false);
    });

    test('extra fields do not break validation', () => {
      const session = makeSession({ annotations: [makeAnnotation()] });
      expect(validateSession({ ...session, extraField: 'hello' })).toBe(true);
    });
  });

  describe('serializeSession / deserializeSession', () => {
    test('valid session round-trips', () => {
      const session = makeSession({ annotations: [makeAnnotation(), makeAnnotation()] });
      const json = serializeSession(session);
      const restored = deserializeSession(json);
      expect(restored).toEqual(session);
    });

    test('scoped session round-trips with viewScope and transition slideIndex', () => {
      const viewScope = makeViewScope({
        kind: 'slide',
        id: 'slide-3',
        index: 3,
        label: 'Slide 4',
        selector: '.slide:nth-of-type(4)',
      });
      const session = makeSession({
        annotations: [makeAnnotation({ viewScope, slideIndex: 3 })],
      });

      const restored = deserializeSession(serializeSession(session));
      expect(restored.annotations[0].viewScope).toEqual(viewScope);
      expect(restored.annotations[0].slideIndex).toBe(3);
    });

    test('malformed JSON throws', () => {
      expect(() => deserializeSession('not json')).toThrow();
    });

    test('valid JSON but invalid session throws', () => {
      expect(() => deserializeSession('{"foo": "bar"}')).toThrow('Invalid session JSON');
    });
  });
});
