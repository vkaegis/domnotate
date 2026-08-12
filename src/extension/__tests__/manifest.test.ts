import { describe, it, expect } from 'vitest';
import manifest from '@/extension/manifest.json';
import { ISOLATED_WORLD_FILE, MAIN_WORLD_FILE } from '@/extension/background';

/**
 * The permission set is a design decision (§3.4) and a store-review liability,
 * not an implementation detail. These assertions exist so that widening it is a
 * deliberate act with a failing test attached.
 */
describe('manifest permissions', () => {
  it('is Manifest V3', () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it('requests exactly activeTab and scripting', () => {
    expect([...manifest.permissions].sort()).toEqual(['activeTab', 'scripting']);
  });

  it('requests no host permissions', () => {
    expect(manifest).not.toHaveProperty('host_permissions');
    expect(manifest).not.toHaveProperty('optional_host_permissions');
  });

  it('declares no content_scripts — everything is injected on the icon click', () => {
    expect(manifest).not.toHaveProperty('content_scripts');
  });

  it('declares a toolbar action, which is the gesture activeTab is granted by', () => {
    expect(manifest.action).toBeDefined();
    expect(manifest.action.default_title).toContain('Domnotate');
  });
});

describe('manifest wiring', () => {
  it('points at the background bundle the extension build emits', () => {
    expect(manifest.background.service_worker).toBe('background.js');
  });

  it('names content script bundles the build actually emits', () => {
    // Both are injected by file name from background.ts, so a rename in
    // vite.extension.config.ts must not silently break activation.
    expect(MAIN_WORLD_FILE).toBe('content-main.js');
    expect(ISOLATED_WORLD_FILE).toBe('content-isolated.js');
  });
});
