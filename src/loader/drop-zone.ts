// ============================================================
// Domnotate — Drop Zone UI
// ============================================================

import './drop-zone.css';
import { createChangelog } from '@/changelog/changelog';
import { createMarkElement } from '@/core/mark';

/**
 * Build the landing-page drop zone inside `container`.
 * Calls `onFile` when a valid HTML file is provided (via drop or browse),
 * and `onUrl` when the user submits a URL.
 */
export function createDropZone(
  container: HTMLElement,
  onFile: (file: File) => void,
  onUrl: (url: string) => void,
): void {
  const VALID_EXTENSIONS = ['.html', '.htm'];

  function isHtmlFile(file: File): boolean {
    const name = file.name.toLowerCase();
    return VALID_EXTENSIONS.some((ext) => name.endsWith(ext));
  }

  function showError(msg: string): void {
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
    setTimeout(() => {
      errorEl.style.display = 'none';
    }, 4000);
  }

  // ---- Layout: split screen ----

  const landing = document.createElement('div');
  landing.className = 'dn-landing';

  // --- Left: Branding ---

  const brand = document.createElement('div');
  brand.className = 'dn-landing__brand';

  const lockup = document.createElement('div');
  lockup.className = 'dn-landing__lockup';

  const mark = document.createElement('div');
  mark.className = 'dn-landing__mark';
  // CSS overrides this; it is only the size without a stylesheet.
  mark.appendChild(createMarkElement(78));

  const title = document.createElement('h1');
  title.className = 'dn-landing__title';
  const titleDom = document.createElement('span');
  titleDom.className = 'dn-landing__title-dom';
  titleDom.textContent = 'DOM';
  const titleNotate = document.createElement('span');
  titleNotate.className = 'dn-landing__title-notate';
  titleNotate.textContent = 'notate';
  title.appendChild(titleDom);
  title.appendChild(titleNotate);

  const desc = document.createElement('p');
  desc.className = 'dn-landing__desc';
  desc.textContent = 'Drop any HTML file. Click elements to pin notes. Export your annotations for agents.';

  const features = document.createElement('div');
  features.className = 'dn-landing__features';

  const featureData = [
    { title: 'Drop', desc: 'HTML files or URLs' },
    { title: 'Pin', desc: 'Notes to elements' },
    { title: 'Export', desc: 'As Markdown or JSON' },
  ];

  for (const f of featureData) {
    const col = document.createElement('div');
    const ft = document.createElement('div');
    ft.className = 'dn-landing__feature-title';
    ft.textContent = f.title;
    const fd = document.createElement('div');
    fd.className = 'dn-landing__feature-desc';
    fd.textContent = f.desc;
    col.appendChild(ft);
    col.appendChild(fd);
    features.appendChild(col);
  }

  // --- Extension callout ---
  //
  // The web app needs a page it can load into an iframe, so anything behind a
  // login is out of reach for it. That is the one gap worth naming on the
  // landing page, because a visitor who came here to annotate their own app is
  // about to discover it by failing.
  const callout = document.createElement('div');
  callout.className = 'dn-landing__callout';

  const calloutTitle = document.createElement('div');
  calloutTitle.className = 'dn-landing__callout-title';
  calloutTitle.textContent = 'Annotate live pages';

  const calloutDesc = document.createElement('p');
  calloutDesc.className = 'dn-landing__callout-desc';
  calloutDesc.textContent =
    'The Chrome extension annotates any page you can open, including apps behind a login, and exports the same notes with the page context an agent needs to find the code.';

  const calloutLink = document.createElement('a');
  calloutLink.className = 'dn-landing__callout-link';
  calloutLink.href =
    'https://chromewebstore.google.com/detail/domnotate/hgllflmkglkhaamjkgmmjhgelhokdkma';
  calloutLink.target = '_blank';
  calloutLink.rel = 'noopener noreferrer';
  calloutLink.textContent = 'Get it on the Chrome Web Store';

  callout.appendChild(calloutTitle);
  callout.appendChild(calloutDesc);
  callout.appendChild(calloutLink);

  const footer = document.createElement('div');
  footer.className = 'dn-landing__footer';

  const footerLinks = document.createElement('div');
  footerLinks.className = 'dn-landing__footer-links';

  const repoLink = document.createElement('a');
  repoLink.className = 'dn-landing__footer-link';
  repoLink.href = 'https://github.com/vkaegis/domnotate';
  repoLink.target = '_blank';
  repoLink.rel = 'noopener noreferrer';
  repoLink.textContent = 'GitHub';

  const attribution = document.createElement('div');
  attribution.className = 'dn-landing__attribution';
  attribution.append('Made with love by ');

  const authorLink = document.createElement('a');
  authorLink.className = 'dn-landing__footer-link';
  authorLink.href = 'https://github.com/vkaegis';
  authorLink.target = '_blank';
  authorLink.rel = 'noopener noreferrer';
  authorLink.textContent = 'Vineet Kumar';
  attribution.appendChild(authorLink);

  // Two groups: the pitch at the top, the secondary things pinned to the bottom.
  const intro = document.createElement('div');
  intro.className = 'dn-landing__intro';
  lockup.appendChild(mark);
  lockup.appendChild(title);
  intro.appendChild(lockup);
  intro.appendChild(desc);
  intro.appendChild(features);

  brand.appendChild(intro);
  brand.appendChild(callout);
  brand.appendChild(footer);

  createChangelog(footerLinks);
  footerLinks.appendChild(repoLink);
  footer.appendChild(footerLinks);
  footer.appendChild(attribution);

  // --- Right: Drop zone ---

  const dropPanel = document.createElement('div');
  dropPanel.className = 'dn-landing__drop';

  const card = document.createElement('div');
  card.className = 'dn-landing__card';

  // Drop area
  const dropArea = document.createElement('div');
  dropArea.className = 'dn-drop-area';
  dropArea.tabIndex = 0;
  dropArea.setAttribute('role', 'button');
  dropArea.setAttribute('aria-label', 'Browse for an HTML file');

  const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  iconSvg.setAttribute('class', 'dn-drop-area__icon');
  iconSvg.setAttribute('viewBox', '0 0 24 24');
  const iconPath1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  iconPath1.setAttribute('x1', '12');
  iconPath1.setAttribute('y1', '19');
  iconPath1.setAttribute('x2', '12');
  iconPath1.setAttribute('y2', '5');
  const iconPath2 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  iconPath2.setAttribute('points', '5 12 12 5 19 12');
  iconSvg.appendChild(iconPath1);
  iconSvg.appendChild(iconPath2);

  const dropLabel = document.createElement('div');
  dropLabel.className = 'dn-drop-area__label';
  dropLabel.textContent = 'Drop HTML here';

  const dropHint = document.createElement('div');
  dropHint.className = 'dn-drop-area__hint';
  dropHint.textContent = '.html or .htm files';

  dropArea.appendChild(iconSvg);
  dropArea.appendChild(dropLabel);
  dropArea.appendChild(dropHint);

  // Separator
  function makeSep(): HTMLElement {
    const sep = document.createElement('div');
    sep.className = 'dn-landing__sep';
    const l = document.createElement('div');
    l.className = 'dn-landing__sep-line';
    const t = document.createElement('span');
    t.className = 'dn-landing__sep-text';
    t.textContent = 'or';
    const r = document.createElement('div');
    r.className = 'dn-landing__sep-line';
    sep.appendChild(l);
    sep.appendChild(t);
    sep.appendChild(r);
    return sep;
  }

  // URL row
  const urlRow = document.createElement('div');
  urlRow.className = 'dn-url-row';

  const urlInput = document.createElement('input');
  urlInput.className = 'dn-url-input';
  urlInput.type = 'text';
  urlInput.placeholder = 'https://';
  urlInput.spellcheck = false;

  const loadBtn = document.createElement('button');
  loadBtn.className = 'dn-load-btn';
  loadBtn.textContent = 'Load';

  urlRow.appendChild(urlInput);
  urlRow.appendChild(loadBtn);

  // Browse button
  const browseBtn = document.createElement('button');
  browseBtn.className = 'dn-browse-btn';
  browseBtn.textContent = 'Browse files';

  // Hidden file input
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.html,.htm';
  fileInput.style.display = 'none';

  // Error
  const errorEl = document.createElement('div');
  errorEl.className = 'dn-landing__error';

  const secondaryActions = document.createElement('div');
  secondaryActions.className = 'dn-landing__secondary-actions';
  secondaryActions.appendChild(urlRow);
  secondaryActions.appendChild(browseBtn);
  secondaryActions.appendChild(errorEl);

  // Assemble card
  card.appendChild(dropArea);
  card.appendChild(makeSep());
  card.appendChild(secondaryActions);
  card.appendChild(fileInput);

  dropPanel.appendChild(card);

  // Assemble landing
  landing.appendChild(brand);
  landing.appendChild(dropPanel);
  container.appendChild(landing);

  // ---- Drag & drop ----

  let dragCounter = 0;

  function setDragActive(active: boolean): void {
    dropArea.classList.toggle('dn-drop-area--active', active);
    dropPanel.classList.toggle('dn-landing__drop--active', active);
  }

  dropPanel.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    setDragActive(true);
  });

  dropPanel.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  dropPanel.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      setDragActive(false);
    }
  });

  dropPanel.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    setDragActive(false);

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!isHtmlFile(file)) {
      showError('Please drop a valid HTML file (.html or .htm)');
      return;
    }
    onFile(file);
  });

  // Click drop area to browse
  dropArea.addEventListener('click', () => {
    fileInput.click();
  });

  dropArea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  // ---- Browse ----

  browseBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!isHtmlFile(file)) {
      showError('Please select a valid HTML file (.html or .htm)');
      fileInput.value = '';
      return;
    }
    onFile(file);
    fileInput.value = '';
  });

  // ---- URL submit ----

  function submitUrl(): void {
    const raw = urlInput.value.trim();
    if (!raw) {
      showError('Please enter a URL');
      return;
    }
    try {
      new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    } catch {
      showError('Please enter a valid URL');
      return;
    }
    const url = raw.startsWith('http') ? raw : `https://${raw}`;
    onUrl(url);
  }

  loadBtn.addEventListener('click', submitUrl);

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitUrl();
  });
}
