import { describe, it, expect, vi } from 'vitest';
import {
  ISOLATED_WORLD_FILE,
  MAIN_WORLD_FILE,
  injectDomnotate,
  registerActionHandler,
  type ChromeApi,
  type ChromeScriptingApi,
  type ChromeTab,
} from '@/extension/background';

type Injection = Parameters<ChromeScriptingApi['executeScript']>[0];

const noopExecute = async (_injection: Injection): Promise<unknown> => [];

/**
 * `chrome.*` is a system boundary with no implementation in this environment,
 * so it is stubbed. Everything under test is our own code.
 */
function fakeChrome(executeScript = vi.fn(noopExecute)): {
  api: ChromeApi;
  executeScript: typeof executeScript;
  listeners: Array<(tab: ChromeTab) => void>;
} {
  const listeners: Array<(tab: ChromeTab) => void> = [];
  return {
    api: {
      scripting: { executeScript },
      action: { onClicked: { addListener: (cb) => listeners.push(cb) } },
    },
    executeScript,
    listeners,
  };
}

describe('injectDomnotate', () => {
  it('injects both worlds into the clicked tab, MAIN first', async () => {
    const { api, executeScript } = fakeChrome();

    expect(await injectDomnotate(api, { id: 7 })).toBe(true);

    expect(executeScript.mock.calls.map(([injection]) => injection)).toEqual([
      { target: { tabId: 7 }, files: [MAIN_WORLD_FILE], world: 'MAIN' },
      { target: { tabId: 7 }, files: [ISOLATED_WORLD_FILE], world: 'ISOLATED' },
    ]);
  });

  it('does nothing without a tab id', async () => {
    const { api, executeScript } = fakeChrome();
    expect(await injectDomnotate(api, {})).toBe(false);
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('reports failure on a page injection is not permitted on', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { api } = fakeChrome(
      vi.fn(async (_injection: Injection): Promise<unknown> => {
        throw new Error('Cannot access contents of the page');
      }),
    );

    expect(await injectDomnotate(api, { id: 1 })).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does not inject the isolated world when the main world fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const executeScript = vi.fn(async (_injection: Injection): Promise<unknown> => {
      throw new Error('blocked');
    });
    const { api } = fakeChrome(executeScript);

    await injectDomnotate(api, { id: 1 });

    expect(executeScript).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('registerActionHandler', () => {
  it('injects on the toolbar icon click, which is the activeTab gesture', async () => {
    const { api, executeScript, listeners } = fakeChrome();
    registerActionHandler(api);

    expect(listeners).toHaveLength(1);
    listeners[0]({ id: 42 });
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(2));
  });
});
