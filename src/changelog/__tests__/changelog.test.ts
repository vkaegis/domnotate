import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createChangelog } from '@/changelog/changelog';
import { CHANGELOG, prUrl, type ChangelogEntry } from '@/changelog/changelog-data';

describe('CHANGELOG data', () => {
  test('every entry has a title, date, and body', () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
    for (const entry of CHANGELOG) {
      expect(entry.title.trim().length).toBeGreaterThan(0);
      expect(entry.date.trim().length).toBeGreaterThan(0);
      expect(entry.body.trim().length).toBeGreaterThan(0);
    }
  });

  test('describes capabilities without em dashes', () => {
    for (const entry of CHANGELOG) {
      expect(entry.title).not.toContain('—');
      expect(entry.body).not.toContain('—');
    }
  });

  test('prUrl links to the repo pull request', () => {
    expect(prUrl(39)).toBe('https://github.com/vkaegis/domnotate/pull/39');
  });
});

describe('createChangelog', () => {
  let container: HTMLElement;
  let changelog: ReturnType<typeof createChangelog>;

  const fixture: ChangelogEntry[] = [
    { title: 'A shipped thing', date: '2 Feb 2026', pr: 42, body: 'You can do a thing now.' },
    { title: 'First release', date: '1 Jan 2026', body: 'An earlier thing, no PR.' },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    changelog = createChangelog(container, fixture);
  });

  afterEach(() => {
    changelog.destroy();
    container.remove();
  });

  test('mounts a trigger in the container', () => {
    const trigger = container.querySelector('.dn-changelog-trigger');
    expect(trigger).not.toBeNull();
    expect(trigger!.textContent).toBe("What's new");
  });

  test('renders an entry per merge with its title and body', () => {
    const entries = document.querySelectorAll('.dn-changelog-entry');
    expect(entries.length).toBe(fixture.length);

    expect(entries[0].querySelector('.dn-changelog-entry__title')!.textContent).toBe('A shipped thing');
    expect(entries[0].querySelector('.dn-changelog-entry__body')!.textContent).toBe('You can do a thing now.');
  });

  test('links an entry back to its pull request in a new tab', () => {
    const entries = document.querySelectorAll('.dn-changelog-entry');
    const link = entries[0].querySelector('.dn-changelog-entry__pr') as HTMLAnchorElement;
    expect(link.textContent).toBe('#42');
    expect(link.getAttribute('href')).toBe('https://github.com/vkaegis/domnotate/pull/42');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  test('omits the PR link when an entry has no PR', () => {
    const entries = document.querySelectorAll('.dn-changelog-entry');
    expect(entries[1].querySelector('.dn-changelog-entry__pr')).toBeNull();
  });

  test('the dialog is exposed with an accessible label', () => {
    const panel = document.querySelector('.dn-changelog-panel')!;
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('true');
    const labelledBy = panel.getAttribute('aria-labelledby');
    expect(document.getElementById(labelledBy!)!.textContent).toBe('Changelog');
  });

  test('starts closed', () => {
    expect(changelog.isOpen()).toBe(false);
    const backdrop = document.querySelector('.dn-changelog-backdrop')!;
    expect(backdrop.classList.contains('dn-changelog-backdrop--hidden')).toBe(true);
  });

  test('clicking the trigger opens the modal', () => {
    const trigger = container.querySelector('.dn-changelog-trigger') as HTMLButtonElement;
    trigger.click();
    expect(changelog.isOpen()).toBe(true);
    const backdrop = document.querySelector('.dn-changelog-backdrop')!;
    expect(backdrop.classList.contains('dn-changelog-backdrop--hidden')).toBe(false);
  });

  test('the close button closes the modal', () => {
    changelog.open();
    const closeBtn = document.querySelector('.dn-changelog-close') as HTMLButtonElement;
    closeBtn.click();
    expect(changelog.isOpen()).toBe(false);
  });

  test('Escape closes the modal', () => {
    changelog.open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(changelog.isOpen()).toBe(false);
  });

  test('clicking the backdrop closes the modal, clicking the panel does not', () => {
    changelog.open();
    const panel = document.querySelector('.dn-changelog-panel') as HTMLElement;
    panel.click();
    expect(changelog.isOpen()).toBe(true);

    const backdrop = document.querySelector('.dn-changelog-backdrop') as HTMLElement;
    backdrop.click();
    expect(changelog.isOpen()).toBe(false);
  });

  test('destroy removes the trigger and modal', () => {
    changelog.destroy();
    expect(container.querySelector('.dn-changelog-trigger')).toBeNull();
    expect(document.querySelector('.dn-changelog-backdrop')).toBeNull();
  });
});
