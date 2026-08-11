import './turnstile-client.css';

const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const CHALLENGE_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * Safety net for revealing the challenge. `before-interactive-callback` is the
 * signal we act on, but if it ever fails to fire the widget would sit invisible
 * waiting on a click nobody can see, which is the failure this surface exists to
 * prevent. An invisible pass normally resolves well inside this window.
 */
const REVEAL_FALLBACK_MS = 3000;

/**
 * Actions are checked server side, so a token minted for one purpose cannot be
 * replayed at the other endpoint.
 */
export const CREATE_SHARE_ACTION = 'create_share';
export const UPDATE_SHARE_ACTION = 'update_share';

const CHALLENGE_CAPTIONS: Record<string, string> = {
  [CREATE_SHARE_ACTION]: 'One quick check, then your share link is ready.',
  [UPDATE_SHARE_ACTION]: 'One quick check, then your changes save to the shared link.',
};

interface TurnstileRenderOptions {
  sitekey: string;
  action: string;
  execution: 'execute';
  appearance: 'interaction-only';
  callback: (token: string) => void;
  'error-callback': () => void;
  'expired-callback': () => void;
  'timeout-callback': () => void;
  'before-interactive-callback': () => void;
  'after-interactive-callback': () => void;
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

interface ChallengeSurface {
  /** Where the widget renders. */
  mount: HTMLElement;
  reveal(): void;
  hide(): void;
  isVisible(): boolean;
  destroy(): void;
}

/**
 * A centred, dimmed surface for the challenge. The widget used to sit pinned to
 * the bottom-right corner, which on a tall page put the checkbox thousands of
 * pixels below the button that triggered it, so sharing looked like it had
 * silently done nothing.
 */
function createChallengeSurface(action: string): ChallengeSurface {
  const backdrop = document.createElement('div');
  backdrop.className = 'dn-challenge-backdrop dn-challenge-backdrop--hidden';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'Verify you are human');

  const panel = document.createElement('div');
  panel.className = 'dn-challenge-panel';

  const caption = document.createElement('p');
  caption.className = 'dn-challenge-caption';
  caption.textContent = CHALLENGE_CAPTIONS[action] ?? 'One quick check to confirm you are human.';

  const mount = document.createElement('div');
  mount.className = 'dn-challenge-widget';

  panel.append(caption, mount);
  backdrop.append(panel);
  document.body.appendChild(backdrop);

  let visible = false;

  return {
    mount,
    reveal() {
      visible = true;
      backdrop.classList.remove('dn-challenge-backdrop--hidden');
    },
    hide() {
      visible = false;
      backdrop.classList.add('dn-challenge-backdrop--hidden');
    },
    isVisible() {
      return visible;
    },
    destroy() {
      backdrop.remove();
    },
  };
}

export async function getTurnstileToken(action: string = CREATE_SHARE_ACTION): Promise<string> {
  const sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  if (!sitekey) {
    throw new Error('Sharing verification is not configured');
  }

  const turnstile = await loadTurnstile();
  const surface = createChallengeSurface(action);

  return new Promise<string>((resolve, reject) => {
    let widgetId: string | null = null;
    let settled = false;

    const finish = (token?: string, message?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(revealFallback);
      document.removeEventListener('keydown', onKeyDown, true);
      if (widgetId !== null) turnstile.remove(widgetId);
      surface.destroy();
      if (token) resolve(token);
      else reject(new Error(message ?? 'Verification failed. Please try sharing again.'));
    };

    /**
     * Escape only cancels once the challenge is on screen. Autosave can run this
     * invisibly at any moment, and swallowing Escape then would both cancel a
     * save the visitor never asked about and steal the key from the popover and
     * edit-mode handlers.
     */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !surface.isVisible()) return;
      event.stopPropagation();
      finish(undefined, 'Verification cancelled');
    };
    document.addEventListener('keydown', onKeyDown, true);

    const timeout = setTimeout(() => finish(), CHALLENGE_TIMEOUT_MS);
    const revealFallback = setTimeout(() => surface.reveal(), REVEAL_FALLBACK_MS);

    widgetId = turnstile.render(surface.mount, {
      sitekey,
      action,
      execution: 'execute',
      appearance: 'interaction-only',
      callback: (token) => finish(token),
      'error-callback': () => finish(),
      'expired-callback': () => finish(),
      'timeout-callback': () => finish(),
      'before-interactive-callback': () => surface.reveal(),
      'after-interactive-callback': () => surface.hide(),
    });
    turnstile.execute(widgetId);
  });
}
