import './styles.css';
import { DEFAULT_CONFIG } from '../types';
import { icons } from '../icons';

// Popup script
document.addEventListener('DOMContentLoaded', async () => {
  // Inject icons
  const logoHeader = document.getElementById('app-logo-header');
  if (logoHeader) logoHeader.innerHTML = icons.logo;

  // Load config and stats
  const result = await chrome.storage.local.get(['thecircle_config', 'thecircle_stats']);
  const config = result.thecircle_config || DEFAULT_CONFIG;
  const stats = result.thecircle_stats || { usageCount: 0, aiCalls: 0 };

  // Update shortcut hint
  updateShortcutHint(config.shortcut);

  const usageCountEl = document.getElementById('usageCount');
  const aiCallsEl = document.getElementById('aiCalls');

  if (usageCountEl) usageCountEl.textContent = String(stats.usageCount);
  if (aiCallsEl) aiCallsEl.textContent = String(stats.aiCalls);

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

  // Open settings button
  const openSettingsBtn = document.getElementById('openSettings');
  openSettingsBtn?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});

function updateShortcutHint(shortcut: string): void {
  const container = document.getElementById('shortcutHint');
  if (!container) return;

  const parts = shortcut.split('+');
  container.innerHTML = parts
    .map(part => `<span class="px-2.5 py-1 rounded text-sm font-medium bg-gray-100 border border-gray-200 text-gray-700 dark:bg-white/10 dark:border-white/20 dark:text-white">${part}</span>`)
    .join('<span class="text-sm text-gray-400 dark:text-white/50">+</span>') +
    '<span class="ml-2 text-sm text-gray-500 dark:text-white/70">呼出菜单</span>';
}
