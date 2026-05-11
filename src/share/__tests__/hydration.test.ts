import { describe, expect, test } from 'vitest';

import { makeAnnotation } from '@/__tests__/fixtures';
import { sessionFromSharedBlob } from '@/share/hydration';
import type { SharedSessionBlob } from '@/share/shared-session';

describe('shared session hydration', () => {
  test('materializes an AnnotationSession from a shared blob', () => {
    const annotations = [makeAnnotation()];
    const blob: SharedSessionBlob = {
      schemaVersion: 1,
      id: 'share-1',
      sourceType: 'file',
      sourceName: 'page.html',
      html: '<html><body>Shared</body></html>',
      annotations,
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z',
    };

    expect(sessionFromSharedBlob(blob, 'blob:http://localhost/share-1')).toEqual({
      id: 'share-1',
      shareId: 'share-1',
      sourceType: 'file',
      sourceName: 'page.html',
      loadedUrl: 'blob:http://localhost/share-1',
      html: '<html><body>Shared</body></html>',
      annotations,
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z',
    });
  });
});
