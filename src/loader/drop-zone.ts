// ============================================================
// Domnotate — Drop Zone UI
// ============================================================

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
  // ---- helpers ----

  function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    styles?: Partial<CSSStyleDeclaration>,
    attrs?: Record<string, string>,
  ): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (styles) Object.assign(node.style, styles);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    }
    return node;
  }

  function text(parent: HTMLElement, txt: string): void {
    parent.appendChild(document.createTextNode(txt));
  }

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

  // ---- layout ----

  container.style.display = 'flex';
  container.style.alignItems = 'center';
  container.style.justifyContent = 'center';
  container.style.height = '100vh';
  container.style.background = 'var(--dn-bg-primary)';
  container.style.padding = '24px';
  container.style.boxSizing = 'border-box';

  // Card
  const card = el('div', {
    background: 'var(--dn-bg-elevated)',
    border: '1px solid var(--dn-border)',
    borderRadius: 'var(--dn-radius-lg)',
    padding: '48px 40px',
    maxWidth: '480px',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '24px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  });

  // Title
  const title = el('h1', {
    margin: '0',
    fontSize: '28px',
    fontWeight: '700',
    letterSpacing: '-0.5px',
    color: 'var(--dn-text-primary)',
    textAlign: 'center',
  });
  text(title, 'Domnotate');

  // Subtitle
  const subtitle = el('p', {
    margin: '0',
    marginTop: '-12px',
    fontSize: '14px',
    color: 'var(--dn-text-secondary)',
    textAlign: 'center',
  });
  text(subtitle, 'Annotate any HTML');

  // ---- Drop area ----
  const dropArea = el('div', {
    border: '2px dashed var(--dn-border)',
    borderRadius: 'var(--dn-radius-md)',
    padding: '40px 24px',
    width: '100%',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    cursor: 'pointer',
    transition: 'border-color var(--dn-transition-normal), background var(--dn-transition-normal)',
    background: 'transparent',
  });

  // File icon (SVG via createElement)
  const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  iconSvg.setAttribute('width', '40');
  iconSvg.setAttribute('height', '40');
  iconSvg.setAttribute('viewBox', '0 0 24 24');
  iconSvg.setAttribute('fill', 'none');
  iconSvg.setAttribute('stroke', 'var(--dn-text-muted)');
  iconSvg.setAttribute('stroke-width', '1.5');
  iconSvg.setAttribute('stroke-linecap', 'round');
  iconSvg.setAttribute('stroke-linejoin', 'round');

  const iconPath1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  iconPath1.setAttribute('d', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z');
  const iconPath2 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  iconPath2.setAttribute('points', '14 2 14 8 20 8');
  const iconPath3 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  iconPath3.setAttribute('x1', '12');
  iconPath3.setAttribute('y1', '18');
  iconPath3.setAttribute('x2', '12');
  iconPath3.setAttribute('y2', '12');
  const iconPath4 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  iconPath4.setAttribute('x1', '9');
  iconPath4.setAttribute('y1', '15');
  iconPath4.setAttribute('x2', '15');
  iconPath4.setAttribute('y2', '15');
  iconSvg.appendChild(iconPath1);
  iconSvg.appendChild(iconPath2);
  iconSvg.appendChild(iconPath3);
  iconSvg.appendChild(iconPath4);
  dropArea.appendChild(iconSvg);

  const dropLabel = el('span', {
    fontSize: '14px',
    color: 'var(--dn-text-secondary)',
    textAlign: 'center',
  });
  text(dropLabel, 'Drop an HTML file here');
  dropArea.appendChild(dropLabel);

  // ---- Separator 1 ----
  function makeSeparator(): HTMLElement {
    const sep = el('div', {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      width: '100%',
    });
    const lineStyle: Partial<CSSStyleDeclaration> = {
      flex: '1',
      height: '1px',
      background: 'var(--dn-border)',
    };
    const left = el('div', lineStyle);
    const right = el('div', lineStyle);
    const label = el('span', {
      fontSize: '12px',
      color: 'var(--dn-text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '1px',
      flexShrink: '0',
    });
    text(label, 'or');
    sep.appendChild(left);
    sep.appendChild(label);
    sep.appendChild(right);
    return sep;
  }

  // ---- URL row ----
  const urlRow = el('div', {
    display: 'flex',
    gap: '8px',
    width: '100%',
  });

  const urlInput = el(
    'input',
    {
      flex: '1',
      padding: '10px 14px',
      fontSize: '14px',
      background: 'var(--dn-bg-secondary)',
      color: 'var(--dn-text-primary)',
      border: '1px solid var(--dn-border)',
      borderRadius: 'var(--dn-radius-sm)',
      outline: 'none',
      transition: 'border-color var(--dn-transition-fast)',
    },
    { type: 'text', placeholder: 'https://example.com', spellcheck: 'false' },
  );

  const loadBtn = el('button', {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: '600',
    background: 'var(--dn-accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--dn-radius-sm)',
    cursor: 'pointer',
    transition: 'background var(--dn-transition-fast)',
    whiteSpace: 'nowrap',
    flexShrink: '0',
  });
  text(loadBtn, 'Load');

  urlRow.appendChild(urlInput);
  urlRow.appendChild(loadBtn);

  // ---- Browse button ----
  const browseBtn = el('button', {
    padding: '10px 24px',
    fontSize: '14px',
    fontWeight: '600',
    background: 'transparent',
    color: 'var(--dn-text-primary)',
    border: '1px solid var(--dn-border)',
    borderRadius: 'var(--dn-radius-sm)',
    cursor: 'pointer',
    transition: 'border-color var(--dn-transition-fast), background var(--dn-transition-fast)',
    width: '100%',
  });
  text(browseBtn, 'Browse files');

  // Hidden file input
  const fileInput = el('input', { display: 'none' }, {
    type: 'file',
    accept: '.html,.htm',
  });

  // ---- Error message ----
  const errorEl = el('div', {
    display: 'none',
    color: '#ef4444',
    fontSize: '13px',
    textAlign: 'center',
    padding: '8px 12px',
    borderRadius: 'var(--dn-radius-sm)',
    background: 'rgba(239,68,68,0.1)',
    width: '100%',
    boxSizing: 'border-box',
  });

  // ---- Assemble card ----
  card.appendChild(title);
  card.appendChild(subtitle);
  card.appendChild(dropArea);
  card.appendChild(makeSeparator());
  card.appendChild(urlRow);
  card.appendChild(makeSeparator());
  card.appendChild(browseBtn);
  card.appendChild(fileInput);
  card.appendChild(errorEl);

  container.appendChild(card);

  // ---- Hover states ----

  urlInput.addEventListener('focus', () => {
    urlInput.style.borderColor = 'var(--dn-accent)';
  });
  urlInput.addEventListener('blur', () => {
    urlInput.style.borderColor = 'var(--dn-border)';
  });

  loadBtn.addEventListener('mouseenter', () => {
    loadBtn.style.background = 'var(--dn-accent-hover)';
  });
  loadBtn.addEventListener('mouseleave', () => {
    loadBtn.style.background = 'var(--dn-accent)';
  });

  browseBtn.addEventListener('mouseenter', () => {
    browseBtn.style.borderColor = 'var(--dn-border-hover)';
    browseBtn.style.background = 'var(--dn-bg-secondary)';
  });
  browseBtn.addEventListener('mouseleave', () => {
    browseBtn.style.borderColor = 'var(--dn-border)';
    browseBtn.style.background = 'transparent';
  });

  // ---- Drag & drop ----

  let dragCounter = 0;

  function setDragActive(active: boolean): void {
    dropArea.style.borderColor = active ? 'var(--dn-accent)' : 'var(--dn-border)';
    dropArea.style.background = active ? 'var(--dn-accent-subtle)' : 'transparent';
  }

  dropArea.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    setDragActive(true);
  });

  dropArea.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  dropArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      setDragActive(false);
    }
  });

  dropArea.addEventListener('drop', (e) => {
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

  // Also allow clicking the drop area to browse
  dropArea.addEventListener('click', () => {
    fileInput.click();
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
    // Basic URL validation
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
