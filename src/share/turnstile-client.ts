const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const CHALLENGE_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * Actions are checked server side, so a token minted for one purpose cannot be
 * replayed at the other endpoint.
 */
export const CREATE_SHARE_ACTION = 'create_share';
export const UPDATE_SHARE_ACTION = 'update_share';

interface TurnstileRenderOptions {
  sitekey: string;
  action: string;
  execution: 'execute';
  appearance: 'interaction-only';
  callback: (token: string) => void;
  'error-callback': () => void;
  'expired-callback': () => void;
  'timeout-callback': () => void;
}

interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string;
  execute(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SCRIPT_URL}"]`);
    const script = existing ?? document.createElement('script');
    const fail = () => {
      script.remove();
      reject(new Error('Verification failed. Please try sharing again.'));
    };

    script.addEventListener('load', () => {
      if (window.turnstile) resolve(window.turnstile);
      else fail();
    }, { once: true });
    script.addEventListener('error', fail, { once: true });

    if (!existing) {
      script.src = TURNSTILE_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }).catch((error: unknown) => {
    scriptPromise = null;
    throw error;
  });

  return scriptPromise;
}

export async function getTurnstileToken(action: string = CREATE_SHARE_ACTION): Promise<string> {
  const sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  if (!sitekey) {
    throw new Error('Sharing verification is not configured');
  }

  const turnstile = await loadTurnstile();
  const container = document.createElement('div');
  Object.assign(container.style, {
    position: 'fixed',
    right: '16px',
    bottom: '16px',
    zIndex: '2147483647',
  });
  document.body.appendChild(container);

  return new Promise<string>((resolve, reject) => {
    let widgetId: string | null = null;
    let settled = false;

    const finish = (token?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (widgetId !== null) turnstile.remove(widgetId);
      container.remove();
      if (token) resolve(token);
      else reject(new Error('Verification failed. Please try sharing again.'));
    };

    const timeout = setTimeout(() => finish(), CHALLENGE_TIMEOUT_MS);
    widgetId = turnstile.render(container, {
      sitekey,
      action,
      execution: 'execute',
      appearance: 'interaction-only',
      callback: (token) => finish(token),
      'error-callback': () => finish(),
      'expired-callback': () => finish(),
      'timeout-callback': () => finish(),
    });
    turnstile.execute(widgetId);
  });
}
