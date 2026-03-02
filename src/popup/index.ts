import './styles.css';
import { DEFAULT_CONFIG } from '../types';
import { icons } from '../icons';

// Popup script
document.addEventListener('DOMContentLoaded', async () => {
  // Inject icons
  const logoHeader = document.getElementById('app-logo-header');
  if (logoHeader) logoHeader.innerHTML = icons.logo;

  // Load config and stats
  const result = await chrome.storage.local.get('thecircle_data');
  const data = result.thecircle_data || {};
  const config = { ...DEFAULT_CONFIG, ...data.config };

  // Shortcut recording state
  let isRecording = false;
  let currentShortcut = config.shortcut || 'Double+Shift';

  // Double-tap detection state
  let lastKeyTime = 0;
  let lastKey = '';
  const DOUBLE_TAP_DELAY = 400;

  // Update shortcut display
  const shortcutDisplayEl = document.getElementById('shortcutDisplay');
  const shortcutHintEl = document.getElementById('shortcutHint');
  const recordShortcutBtn = document.getElementById('recordShortcutBtn');

  updateShortcutDisplay(currentShortcut);

  // Shortcut recording
  recordShortcutBtn?.addEventListener('click', () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  });

  function startRecording() {
    isRecording = true;
    lastKeyTime = 0;
    lastKey = '';
    recordShortcutBtn!.classList.add('recording');
    shortcutDisplayEl!.classList.add('recording');
    if (shortcutHintEl) {
      shortcutHintEl.textContent = '按组合键或连按两次同一键... (ESC 取消)';
    }
    document.addEventListener('keydown', handleShortcutKeyDown);
  }

  function stopRecording() {
    isRecording = false;
    lastKeyTime = 0;
    lastKey = '';
    recordShortcutBtn!.classList.remove('recording');
    shortcutDisplayEl!.classList.remove('recording');
    if (shortcutHintEl) shortcutHintEl.textContent = '点击录制按钮设置新快捷键';
    document.removeEventListener('keydown', handleShortcutKeyDown);
  }

  function handleShortcutKeyDown(e: KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
      stopRecording();
      return;
    }

    const now = Date.now();
    const key = e.key;

    // Check for double-tap first (same key pressed twice quickly)
    if (lastKey === key && (now - lastKeyTime) < DOUBLE_TAP_DELAY) {
      // Double-tap detected
      const keyName = getKeyName(key);
      currentShortcut = `Double+${keyName}`;
      updateShortcutDisplay(currentShortcut);
      saveShortcut(currentShortcut);
      stopRecording();
      return;
    }

    // Check for modifier combo (modifier + non-modifier key)
    const hasModifier = e.ctrlKey || e.metaKey || e.altKey || e.shiftKey;
    const isModifierKey = ['Control', 'Alt', 'Shift', 'Meta'].includes(key);

    if (hasModifier && !isModifierKey) {
      // Combo key detected
      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      const formattedKey = key === ' ' ? 'Space' : key.length === 1 ? key.toUpperCase() : key;
      parts.push(formattedKey);

      currentShortcut = parts.join('+');
      updateShortcutDisplay(currentShortcut);
      saveShortcut(currentShortcut);
      stopRecording();
      return;
    }

    // Single key press - wait for potential double-tap
    lastKeyTime = now;
    lastKey = key;
    if (shortcutHintEl) {
      shortcutHintEl.textContent = `再按一次 ${getKeyName(key)} 或按组合键...`;
    }
  }

  function getKeyName(key: string): string {
    const keyMap: Record<string, string> = {
      'Shift': 'Shift',
      'Control': 'Control',
      'Alt': 'Alt',
      'Meta': 'Meta',
      ' ': 'Space',
      'Tab': 'Tab',
    };
    return keyMap[key] || (key.length === 1 ? key.toUpperCase() : key);
  }

  async function saveShortcut(shortcut: string) {
    const stored = await chrome.storage.local.get('thecircle_data');
    const data = stored.thecircle_data || {};
    const currentConfig = { ...DEFAULT_CONFIG, ...data.config };
    data.config = { ...currentConfig, shortcut };
    await chrome.storage.local.set({ thecircle_data: data });
    if (shortcutHintEl) {
      shortcutHintEl.textContent = '快捷键已保存';
      setTimeout(() => {
        if (shortcutHintEl) shortcutHintEl.textContent = '点击录制按钮设置新快捷键';
      }, 2000);
    }
  }

  function updateShortcutDisplay(shortcut: string): void {
    if (!shortcutDisplayEl) return;

    // Handle Double+Key format
    if (shortcut.startsWith('Double+')) {
      const key = shortcut.slice(7);
      shortcutDisplayEl.innerHTML = `
        <span class="shortcut-key">${key}</span>
        <span class="shortcut-separator">×2</span>
      `;
    } else {
      const parts = shortcut.split('+');
      shortcutDisplayEl.innerHTML = parts
        .map(part => `<span class="shortcut-key">${part}</span>`)
        .join('<span class="shortcut-separator">+</span>');
    }
  }

  // Open menu button
  const openMenuBtn = document.getElementById('openMenu');
  openMenuBtn?.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_MENU' });
        window.close();
      } catch (error) {
        // Content script not loaded, try to inject it
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          });
          await chrome.scripting.insertCSS({
            target: { tabId: tab.id },
            files: ['assets/content.css']
          });
          // Wait for script to initialize
          await new Promise(resolve => setTimeout(resolve, 100));
          await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_MENU' });
          window.close();
        } catch (injectError) {
          console.error('Failed to inject:', injectError);
          alert('无法在此页面使用。可能是浏览器限制的页面。');
        }
      }
    }
  });

  // Open settings button - now opens settings in content panel
  const openSettingsBtn = document.getElementById('openSettings');
  openSettingsBtn?.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_SETTINGS' });
        window.close();
      } catch (error) {
        // Content script not loaded, try to inject it
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          });
          await chrome.scripting.insertCSS({
            target: { tabId: tab.id },
            files: ['assets/content.css']
          });
          // Wait for script to initialize
          await new Promise(resolve => setTimeout(resolve, 100));
          await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_SETTINGS' });
          window.close();
        } catch (injectError) {
          console.error('Failed to inject:', injectError);
          alert('无法在此页面使用。可能是浏览器限制的页面。');
        }
      }
    }
  });
});
