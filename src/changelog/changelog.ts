// ============================================================
// Domnotate — Changelog Modal
// ============================================================

import './changelog.css';
import { CHANGELOG, prUrl, type ChangelogEntry } from './changelog-data';

export interface ChangelogController {
  open(): void;
  close(): void;
  isOpen(): boolean;
  destroy(): void;
}

/**
 * Mount a "What's new" trigger inside `container` and a matching modal on
 * `document.body`. Clicking the trigger opens the changelog; Escape, the close
 * button, or a click on the backdrop closes it.
 */
export function createChangelog(
  container: HTMLElement,
  entries: ChangelogEntry[] = CHANGELOG,
): ChangelogController {
  const titleId = 'dn-changelog-title';

  // ---- Trigger ----

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'dn-changelog-trigger';
  trigger.textContent = "What's new";
  container.appendChild(trigger);

  // ---- Modal ----

  const backdrop = document.createElement('div');
  backdrop.className = 'dn-changelog-backdrop dn-changelog-backdrop--hidden';

  const panel = document.createElement('div');
  panel.className = 'dn-changelog-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', titleId);

  const header = document.createElement('div');
  header.className = 'dn-changelog-header';

  const title = document.createElement('h2');
  title.className = 'dn-changelog-title';
  title.id = titleId;
  title.textContent = 'Changelog';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'dn-changelog-close';
  closeBtn.setAttribute('aria-label', 'Close changelog');
  closeBtn.textContent = '×';

  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'dn-changelog-body';

  for (const entry of entries) {
    const section = document.createElement('section');
    section.className = 'dn-changelog-entry';

    const meta = document.createElement('div');
    meta.className = 'dn-changelog-entry__meta';

    const date = document.createElement('span');
    date.className = 'dn-changelog-entry__date';
    date.textContent = entry.date;
    meta.appendChild(date);

    if (entry.pr !== undefined) {
      const link = document.createElement('a');
      link.className = 'dn-changelog-entry__pr';
      link.href = prUrl(entry.pr);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = `#${entry.pr}`;
      meta.appendChild(link);
    }

    const heading = document.createElement('h3');
    heading.className = 'dn-changelog-entry__title';
    heading.textContent = entry.title;

    const text = document.createElement('p');
    text.className = 'dn-changelog-entry__body';
    text.textContent = entry.body;

    section.appendChild(meta);
    section.appendChild(heading);
    section.appendChild(text);
    body.appendChild(section);
  }

  panel.appendChild(header);
  panel.appendChild(body);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);

  // ---- Behaviour ----

  let open = false;

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  function openModal(): void {
    if (open) return;
    open = true;
    backdrop.classList.remove('dn-changelog-backdrop--hidden');
    document.addEventListener('keydown', onKeydown);
    closeBtn.focus();
  }

  function close(): void {
    if (!open) return;
    open = false;
    backdrop.classList.add('dn-changelog-backdrop--hidden');
    document.removeEventListener('keydown', onKeydown);
    trigger.focus();
  }

  trigger.addEventListener('click', openModal);
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  return {
    open: openModal,
    close,
    isOpen: () => open,
    destroy(): void {
      document.removeEventListener('keydown', onKeydown);
      trigger.remove();
      backdrop.remove();
    },
  };
}
