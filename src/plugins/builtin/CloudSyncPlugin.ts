// CloudSync Plugin — Google login, cloud sync, backup management

import { AuthState, MenuConfig, DEFAULT_SYNC_OPTIONS, SyncOptions } from '../../types';
import { icons } from '../../icons';
import { t } from '../../i18n';
import { getAccountSettingsHTML } from '../../content/CommandPalette/views/SettingsView';
import type { Plugin, SettingsContributor, PluginContext } from '../types';

export class CloudSyncPlugin implements Plugin, SettingsContributor {
  readonly id = 'cloudSync';
  readonly name = 'Cloud Sync';
  readonly description = 'plugin.cloudSync.description';
  readonly icon = icons.cloudSync;
  readonly settingsOrder = -100; // Render at top of main settings page

  private ctx!: PluginContext;
  private authState: AuthState | null = null;

  activate(ctx: PluginContext): void {
    this.ctx = ctx;
  }

  deactivate(): void {
    this.authState = null;
  }

  // ---- SettingsContributor ----

  getSettingsHTML(config: MenuConfig): string {
    return `
      <div class="glass-settings-section">
        <div class="glass-settings-section-title">${t('settings.account')}</div>
        <div id="cloud-sync-account-section">
          ${getAccountSettingsHTML(this.authState, config)}
        </div>
      </div>
    `;
  }

  bindSettingsEvents(shadowRoot: ShadowRoot, tempConfig: MenuConfig, onChange: () => void): void {
    // Load auth state lazily, then patch the account section in-place
    // (a full renderCurrentView would cause an infinite loop since it re-calls bindSettingsEvents)
    if (!this.authState) {
      this.loadAuthState().then(() => {
        const section = shadowRoot.querySelector('#cloud-sync-account-section');
        if (section) {
          section.innerHTML = getAccountSettingsHTML(this.authState, tempConfig);
          // Re-bind events on the refreshed DOM
          this.bindAccountEvents(shadowRoot, tempConfig, onChange);
        }
      });
    }

    this.bindAccountEvents(shadowRoot, tempConfig, onChange);
  }

  private bindAccountEvents(shadowRoot: ShadowRoot, tempConfig: MenuConfig, onChange: () => void): void {
    // Google login
    shadowRoot.querySelector('#google-login-btn')?.addEventListener('click', () => void this.handleGoogleLogin());
    shadowRoot.querySelector('#google-relogin-btn')?.addEventListener('click', () => void this.handleGoogleLogin());

    // Logout
    shadowRoot.querySelector('.glass-btn-logout')?.addEventListener('click', () => void this.handleGoogleLogout());

    // Sync toggle
    const syncToggle = shadowRoot.querySelector('#sync-enabled-toggle') as HTMLInputElement | null;
    const syncActions = shadowRoot.querySelector('#sync-actions') as HTMLElement | null;
    const backupSection = shadowRoot.querySelector('#backup-history-section') as HTMLElement | null;
    const syncOptionsSection = shadowRoot.querySelector('#sync-options') as HTMLElement | null;
    syncToggle?.addEventListener('change', () => {
      if (syncActions) syncActions.style.display = syncToggle.checked ? 'flex' : 'none';
      if (backupSection) backupSection.style.display = syncToggle.checked ? 'block' : 'none';
      if (syncOptionsSection) syncOptionsSection.style.display = syncToggle.checked ? 'block' : 'none';
      void this.handleSyncToggle(syncToggle.checked);
      if (syncToggle.checked) {
        void this.loadBackupList();
      }
    });

    // Sync option checkboxes
    const syncOptKeys: Array<{ id: string; key: keyof SyncOptions }> = [
      { id: 'sync-opt-translation', key: 'translation' },
      { id: 'sync-opt-summary', key: 'summary' },
      { id: 'sync-opt-knowledge', key: 'knowledge' },
      { id: 'sync-opt-annotation', key: 'annotation' },
      { id: 'sync-opt-browseTrail', key: 'browseTrail' },
    ];
    for (const { id, key } of syncOptKeys) {
      const checkbox = shadowRoot.querySelector(`#${id}`) as HTMLInputElement | null;
      checkbox?.addEventListener('change', () => {
        if (!tempConfig.syncOptions) {
          tempConfig.syncOptions = { translation: true, summary: true, knowledge: true, annotation: true, browseTrail: true };
        }
        tempConfig.syncOptions[key] = checkbox.checked;
        onChange();
      });
    }

    // Upload / Download buttons
    const syncToCloudBtn = shadowRoot.querySelector('#sync-to-cloud-btn') as HTMLButtonElement | null;
    syncToCloudBtn?.addEventListener('click', () => void this.handleSyncToCloud(syncToCloudBtn));

    const syncFromCloudBtn = shadowRoot.querySelector('#sync-from-cloud-btn') as HTMLButtonElement | null;
    syncFromCloudBtn?.addEventListener('click', () => void this.handleSyncFromCloud(syncFromCloudBtn));

    // Backup list refresh
    shadowRoot.querySelector('#refresh-backups-btn')?.addEventListener('click', () => void this.loadBackupList());
    if (this.authState?.syncEnabled) {
      void this.loadBackupList();
    }
  }

  // ---- Private methods (migrated from CommandPalette) ----

  private async loadAuthState(): Promise<void> {
    try {
      const response = await this.ctx.sendMessage({ type: 'GOOGLE_AUTH_STATUS' }) as AuthState;
      this.authState = response;
    } catch (error) {
      console.error('Failed to load auth state:', error);
      this.authState = { isLoggedIn: false, user: null, syncEnabled: false };
    }
  }

  private async handleGoogleLogin(): Promise<void> {
    try {
      const response = await this.ctx.sendMessage({ type: 'GOOGLE_AUTH_LOGIN' }) as { success: boolean; error?: string };
      if (response.success) {
        await this.loadAuthState();
        this.ctx.ui.renderCurrentView(true, true);
        this.ctx.showToast(t('settings.loginSuccess'));
      } else {
        this.ctx.showToast(response.error || t('settings.loginFailed'));
      }
    } catch (error) {
      console.error('Google login error:', error);
      this.ctx.showToast(t('settings.loginFailed'));
    }
  }

  private async handleGoogleLogout(): Promise<void> {
    try {
      const response = await this.ctx.sendMessage({ type: 'GOOGLE_AUTH_LOGOUT' }) as { success: boolean; error?: string };
      if (response.success) {
        this.authState = { isLoggedIn: false, user: null, syncEnabled: false };
        this.ctx.ui.renderCurrentView(true, true);
        this.ctx.showToast(t('settings.logoutSuccess'));
      } else {
        this.ctx.showToast(response.error || t('settings.logoutFailed'));
      }
    } catch (error) {
      console.error('Google logout error:', error);
      this.ctx.showToast(t('settings.logoutFailed'));
    }
  }

  private async handleSyncToggle(enabled: boolean): Promise<void> {
    try {
      await this.ctx.sendMessage({ type: 'SET_SYNC_ENABLED', payload: enabled });
      if (this.authState) {
        this.authState.syncEnabled = enabled;
      }
      if (enabled) {
        const syncResult = await this.ctx.sendMessage({ type: 'SYNC_FROM_CLOUD' }) as { success: boolean; data?: unknown };
        if (syncResult.success && syncResult.data) {
          // Cloud had data — re-render to reflect changes
          this.ctx.ui.renderCurrentView(true, true);
          this.ctx.showToast(t('settings.syncEnabledWithRestore'));
        } else {
          await this.ctx.sendMessage({ type: 'SYNC_TO_CLOUD' });
          this.ctx.showToast(t('settings.syncEnabled'));
        }
      } else {
        this.ctx.showToast(t('settings.syncDisabled'));
      }
    } catch (error) {
      console.error('Sync toggle error:', error);
      this.ctx.showToast(t('settings.operationFailed'));
    }
  }

  private async handleSyncToCloud(btn: HTMLButtonElement): Promise<void> {
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<span class="glass-spinner"></span> ' + t('settings.syncing');
    btn.disabled = true;

    try {
      const response = await this.ctx.sendMessage({ type: 'SYNC_TO_CLOUD' }) as { success: boolean; error?: string };
      if (response.success) {
        this.ctx.showToast(t('settings.uploadSuccess'));
      } else {
        this.ctx.showToast(response.error || t('settings.uploadFailed'));
      }
    } catch (error) {
      console.error('Sync to cloud error:', error);
      this.ctx.showToast(t('settings.uploadFailed'));
    } finally {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
    }
  }

  private async handleSyncFromCloud(btn: HTMLButtonElement): Promise<void> {
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<span class="glass-spinner"></span> ' + t('settings.syncing');
    btn.disabled = true;

    try {
      const response = await this.ctx.sendMessage({ type: 'SYNC_FROM_CLOUD' }) as { success: boolean; error?: string };
      if (response.success) {
        this.ctx.showToast(t('settings.downloadSuccess'));
        this.ctx.ui.renderCurrentView(true, true);
      } else {
        this.ctx.showToast(response.error || t('settings.restoreFailed'));
      }
    } catch (error) {
      console.error('Sync from cloud error:', error);
      this.ctx.showToast(t('settings.restoreFailed'));
    } finally {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
    }
  }

  private formatBackupTime(timestamp: number): string {
    const d = new Date(timestamp);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hour = String(d.getHours()).padStart(2, '0');
    const minute = String(d.getMinutes()).padStart(2, '0');
    return `${month}-${day} ${hour}:${minute}`;
  }

  private formatRelativeTime(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t('time.justNow');
    if (minutes < 60) return t('time.minutesAgo', { n: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('time.hoursAgo', { n: hours });
    const days = Math.floor(hours / 24);
    if (days < 30) return t('time.daysAgo', { n: days });
    return t('time.monthsAgo', { n: Math.floor(days / 30) });
  }

  private static SPINNER_SVG = '<svg class="glass-backup-spinner" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 2a10 10 0 0 1 10 10" /></svg>';

  private async loadBackupList(): Promise<void> {
    const shadowRoot = this.ctx.getShadowRoot();
    if (!shadowRoot) return;
    const listEl = shadowRoot.querySelector('#backup-list');
    if (!listEl) return;

    listEl.innerHTML = `<div class="glass-backup-empty">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.4">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>
      <span>${t('common.loading')}</span>
    </div>`;

    try {
      const response = await this.ctx.sendMessage({ type: 'LIST_BACKUPS' }) as { success: boolean; error?: string; backups?: Array<{ id: string; name: string; timestamp: number }> };
      if (!response.success) {
        listEl.innerHTML = `<div class="glass-backup-empty"><span>${response.error || t('settings.loadFailed')}</span></div>`;
        return;
      }

      const backups = response.backups || [];
      if (backups.length === 0) {
        listEl.innerHTML = `<div class="glass-backup-empty">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.4">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
          </svg>
          <span>${t('settings.noBackups')}</span>
        </div>`;
        return;
      }

      listEl.innerHTML = backups.map((b, i) => `
        <div class="glass-backup-item${i === 0 ? ' glass-backup-item-latest' : ''}" data-id="${b.id}">
          <div class="glass-backup-info">
            <div class="glass-backup-dot"></div>
            <div class="glass-backup-meta">
              <span class="glass-backup-time">${this.formatBackupTime(b.timestamp)}</span>
              <span class="glass-backup-label">${i === 0 ? t('settings.latestBackup') : this.formatRelativeTime(b.timestamp)}</span>
            </div>
          </div>
          <div class="glass-backup-actions">
            <button class="glass-backup-action-btn glass-btn-restore" data-id="${b.id}" title="${t('settings.restoreBackup')}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="1 4 1 10 7 10"></polyline>
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
              </svg>
            </button>
            <button class="glass-backup-action-btn glass-backup-action-btn-danger glass-btn-delete-backup" data-id="${b.id}" title="${t('settings.deleteBackup')}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `).join('');

      // Bind restore buttons
      listEl.querySelectorAll('.glass-btn-restore').forEach(btn => {
        btn.addEventListener('click', () => {
          const fileId = (btn as HTMLElement).dataset.id!;
          this.handleRestoreBackup(fileId, btn as HTMLButtonElement);
        });
      });

      // Bind delete buttons
      listEl.querySelectorAll('.glass-btn-delete-backup').forEach(btn => {
        btn.addEventListener('click', () => {
          const fileId = (btn as HTMLElement).dataset.id!;
          this.handleDeleteBackup(fileId, btn as HTMLButtonElement);
        });
      });
    } catch (error) {
      console.error('Load backup list error:', error);
      listEl.innerHTML = `<div class="glass-backup-empty"><span>${t('settings.loadFailed')}</span></div>`;
    }
  }

  private async handleRestoreBackup(fileId: string, btn: HTMLButtonElement): Promise<void> {
    const originalHTML = btn.innerHTML;
    const item = btn.closest('.glass-backup-item');
    btn.innerHTML = CloudSyncPlugin.SPINNER_SVG;
    btn.disabled = true;
    item?.classList.add('glass-backup-item-loading');

    try {
      const response = await this.ctx.sendMessage({ type: 'RESTORE_BACKUP', payload: { fileId } }) as { success: boolean; error?: string };
      if (response.success) {
        this.ctx.showToast(t('settings.backupRestored'));
        this.ctx.ui.renderCurrentView(true, true);
      } else {
        this.ctx.showToast(response.error || t('settings.restoreFailed'));
      }
    } catch (error) {
      console.error('Restore backup error:', error);
      this.ctx.showToast(t('settings.restoreFailed'));
    } finally {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
      item?.classList.remove('glass-backup-item-loading');
    }
  }

  private async handleDeleteBackup(fileId: string, btn: HTMLButtonElement): Promise<void> {
    const originalHTML = btn.innerHTML;
    const item = btn.closest('.glass-backup-item');
    btn.innerHTML = CloudSyncPlugin.SPINNER_SVG;
    btn.disabled = true;
    item?.classList.add('glass-backup-item-loading');

    try {
      const response = await this.ctx.sendMessage({ type: 'DELETE_BACKUP', payload: { fileId } }) as { success: boolean; error?: string };
      if (response.success) {
        this.ctx.showToast(t('settings.backupDeleted'));
        this.loadBackupList();
      } else {
        this.ctx.showToast(response.error || t('settings.deleteFailed'));
      }
    } catch (error) {
      console.error('Delete backup error:', error);
      this.ctx.showToast(t('settings.deleteFailed'));
    } finally {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
      item?.classList.remove('glass-backup-item-loading');
    }
  }
}
