import { describe, expect, test, vi } from 'vitest';

import { makeSession } from '@/__tests__/fixtures';
import { publishOrCopyShare } from '@/share/share-action';

describe('publishOrCopyShare', () => {
  test('copies the existing link without publishing a new share for cloud-backed sessions', async () => {
    const session = makeSession({
      shareId: 'share-123',
      html: '<html><body>Shared</body></html>',
    });
    const publishShare = vi.fn();
    const copyToClipboard = vi.fn().mockResolvedValue(true);
    const cacheSession = vi.fn();

    await expect(
      publishOrCopyShare(session, {
        origin: 'https://domnotate.example.com',
        publishShare,
        copyToClipboard,
        cacheSession,
      }),
    ).resolves.toEqual({
      id: 'share-123',
      url: 'https://domnotate.example.com/share/share-123',
      published: false,
    });

    expect(publishShare).not.toHaveBeenCalled();
    expect(cacheSession).not.toHaveBeenCalled();
    expect(copyToClipboard).toHaveBeenCalledWith('https://domnotate.example.com/share/share-123');
    expect(session.shareId).toBe('share-123');
  });

  test('publishes, stamps, copies, and caches local sessions', async () => {
    const session = makeSession({
      html: '<html><body>Local</body></html>',
    });
    const publishShare = vi.fn().mockResolvedValue({ id: 'share-new' });
    const copyToClipboard = vi.fn().mockResolvedValue(true);
    const cacheSession = vi.fn().mockResolvedValue(undefined);

    await expect(
      publishOrCopyShare(session, {
        origin: 'https://domnotate.example.com',
        publishShare,
        copyToClipboard,
        cacheSession,
      }),
    ).resolves.toEqual({
      id: 'share-new',
      url: 'https://domnotate.example.com/share/share-new',
      published: true,
    });

    expect(publishShare).toHaveBeenCalledWith(session);
    expect(session.shareId).toBe('share-new');
    expect(copyToClipboard).toHaveBeenCalledWith('https://domnotate.example.com/share/share-new');
    expect(cacheSession).toHaveBeenCalledWith(session);
  });

  test('caches the share id before reporting a clipboard failure', async () => {
    const session = makeSession({
      html: '<html><body>Local</body></html>',
    });
    const publishShare = vi.fn().mockResolvedValue({ id: 'share-new' });
    const copyToClipboard = vi.fn().mockResolvedValue(false);
    const cacheSession = vi.fn().mockResolvedValue(undefined);

    await expect(
      publishOrCopyShare(session, {
        origin: 'https://domnotate.example.com',
        publishShare,
        copyToClipboard,
        cacheSession,
      }),
    ).rejects.toThrow('Share created, but the link could not be copied');

    expect(session.shareId).toBe('share-new');
    expect(cacheSession).toHaveBeenCalledWith(session);
    expect(cacheSession.mock.invocationCallOrder[0]).toBeLessThan(
      copyToClipboard.mock.invocationCallOrder[0],
    );
  });
});
