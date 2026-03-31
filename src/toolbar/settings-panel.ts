// ============================================================
// Domnotate — Settings Panel
// ============================================================

import type { EventBus } from '@/types/core';

const STORAGE_KEY = 'domnotate:settings';

const COLOR_PRESETS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Yellow', value: '#eab308' },
] as const;

interface SettingsData {
  authorName: string;
  color: string;
}

function loadSettings(): SettingsData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SettingsData>;
      return {
        authorName: parsed.authorName || 'Anonymous',
        color: parsed.color || COLOR_PRESETS[0].value,
      };
    }
  } catch {
    // Ignore parse errors
  }
  return { authorName: 'Anonymous', color: COLOR_PRESETS[0].value };
}

function saveSettings(data: SettingsData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore quota errors
  }
}

export function createSettingsPanel(
  bus: EventBus,
  shortcuts?: Array<{ key: string; label: string }>,
): {
  open(): void;
  close(): void;
  getSettings(): { authorName: string; color: string };
  destroy(): void;
} {
  // Suppress unused parameter warning — bus reserved for future events
  void bus;

  let settings = loadSettings();

  // --- Build DOM ---
  const backdrop = document.createElement('div');
  Object.assign(backdrop.style, {
    position: 'fixed',
    inset: '0',
    background: 'rgba(0,0,0,0.5)',
    zIndex: '2000',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
  });

  const panel = document.createElement('div');
  Object.assign(panel.style, {
    background: 'var(--dn-bg-elevated)',
    border: '1px solid var(--dn-border)',
    borderRadius: 'var(--dn-radius-lg)',
    padding: '24px',
    width: '320px',
    maxWidth: '90vw',
    color: 'var(--dn-text-primary)',
    fontFamily: 'system-ui, sans-serif',
  });

  // Title
  const title = document.createElement('h3');
  title.textContent = 'Settings';
  Object.assign(title.style, {
    margin: '0 0 20px',
    fontSize: '16px',
    fontWeight: '600',
  });
  panel.appendChild(title);

  // Author name
  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Author name';
  Object.assign(nameLabel.style, {
    display: 'block',
    fontSize: '13px',
    color: 'var(--dn-text-secondary)',
    marginBottom: '6px',
  });
  panel.appendChild(nameLabel);

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = settings.authorName;
  nameInput.placeholder = 'Your name';
  Object.assign(nameInput.style, {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid var(--dn-border)',
    borderRadius: 'var(--dn-radius-sm)',
    background: 'var(--dn-bg-secondary)',
    color: 'var(--dn-text-primary)',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: '20px',
  });
  nameInput.addEventListener('input', () => {
    settings.authorName = nameInput.value.trim() || 'Anonymous';
    saveSettings(settings);
  });
  panel.appendChild(nameInput);

  // Color presets
  const colorLabel = document.createElement('label');
  colorLabel.textContent = 'Pin color';
  Object.assign(colorLabel.style, {
    display: 'block',
    fontSize: '13px',
    color: 'var(--dn-text-secondary)',
    marginBottom: '8px',
  });
  panel.appendChild(colorLabel);

  const colorRow = document.createElement('div');
  Object.assign(colorRow.style, {
    display: 'flex',
    gap: '8px',
    marginBottom: '20px',
  });

  const colorBtns: HTMLButtonElement[] = [];

  for (const preset of COLOR_PRESETS) {
    const btn = document.createElement('button');
    btn.title = preset.name;
    Object.assign(btn.style, {
      width: '32px',
      height: '32px',
      borderRadius: '50%',
      border: '2px solid transparent',
      background: preset.value,
      cursor: 'pointer',
      padding: '0',
      transition: 'border-color 120ms ease',
    });
    if (settings.color === preset.value) {
      btn.style.borderColor = 'var(--dn-text-primary)';
    }
    btn.addEventListener('click', () => {
      settings.color = preset.value;
      saveSettings(settings);
      // Update selection ring
      for (const b of colorBtns) {
        b.style.borderColor = 'transparent';
      }
      btn.style.borderColor = 'var(--dn-text-primary)';
    });
    colorBtns.push(btn);
    colorRow.appendChild(btn);
  }
  panel.appendChild(colorRow);

  // Keyboard shortcuts section
  if (shortcuts && shortcuts.length > 0) {
    const divider = document.createElement('div');
    Object.assign(divider.style, {
      height: '1px',
      background: 'var(--dn-border)',
      margin: '4px 0 20px',
    });
    panel.appendChild(divider);

    const shortcutsLabel = document.createElement('label');
    shortcutsLabel.textContent = 'Keyboard shortcuts';
    Object.assign(shortcutsLabel.style, {
      display: 'block',
      fontSize: '13px',
      color: 'var(--dn-text-secondary)',
      marginBottom: '10px',
    });
    panel.appendChild(shortcutsLabel);

    const shortcutList = document.createElement('div');
    Object.assign(shortcutList.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      marginBottom: '20px',
    });

    const displayKey = (key: string): string => {
      if (key === 'Delete') return 'Del';
      if (key === 'Backspace') return '\u232B';
      if (key === 'Escape') return 'Esc';
      return key.toUpperCase();
    };

    for (const s of shortcuts) {
      // Skip duplicate Backspace entry (Delete already covers it)
      if (s.key === 'Backspace') continue;

      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      });

      const kbd = document.createElement('kbd');
      kbd.textContent = displayKey(s.key);
      Object.assign(kbd.style, {
        display: 'inline-block',
        minWidth: '28px',
        padding: '2px 8px',
        borderRadius: 'var(--dn-radius-sm)',
        border: '1px solid var(--dn-border)',
        background: 'var(--dn-bg-secondary)',
        color: 'var(--dn-text-primary)',
        fontSize: '12px',
        fontFamily: 'system-ui, sans-serif',
        fontWeight: '500',
        textAlign: 'center',
      });

      const desc = document.createElement('span');
      desc.textContent = s.label;
      Object.assign(desc.style, {
        fontSize: '13px',
        color: 'var(--dn-text-secondary)',
      });

      row.appendChild(kbd);
      row.appendChild(desc);
      shortcutList.appendChild(row);
    }

    panel.appendChild(shortcutList);
  }

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Done';
  Object.assign(closeBtn.style, {
    width: '100%',
    padding: '8px',
    border: 'none',
    borderRadius: 'var(--dn-radius-sm)',
    background: 'var(--dn-accent)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  });
  closeBtn.addEventListener('click', () => close());
  panel.appendChild(closeBtn);

  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);

  // Close on backdrop click
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  // Close on Escape
  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') close();
  }

  // --- Public API ---

  function open(): void {
    // Refresh values from storage in case changed externally
    settings = loadSettings();
    nameInput.value = settings.authorName;
    for (const btn of colorBtns) {
      const preset = COLOR_PRESETS[colorBtns.indexOf(btn)];
      btn.style.borderColor =
        settings.color === preset.value ? 'var(--dn-text-primary)' : 'transparent';
    }
    backdrop.style.display = 'flex';
    document.addEventListener('keydown', onKeyDown);
    nameInput.focus();
  }

  function close(): void {
    backdrop.style.display = 'none';
    document.removeEventListener('keydown', onKeyDown);
  }

  return {
    open,
    close,
    getSettings(): { authorName: string; color: string } {
      return { ...settings };
    },
    destroy(): void {
      close();
      backdrop.remove();
    },
  };
}
