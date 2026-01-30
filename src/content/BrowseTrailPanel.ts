// Browse Trail - Visual browsing history with semantic search
import { TrailEntry, BrowseSession } from '../types';

const TRAIL_STORAGE_KEY = 'thecircle_browse_trail';

// Helper functions for CommandPalette to use

export async function loadBrowseTrailSessions(): Promise<BrowseSession[]> {
  try {
    const result = await chrome.storage.local.get(TRAIL_STORAGE_KEY);
    return result[TRAIL_STORAGE_KEY] || [];
  } catch {
    return [];
  }
}

export async function deleteTrailEntry(id: string): Promise<BrowseSession[]> {
  const sessions = await loadBrowseTrailSessions();

  for (const session of sessions) {
    session.entries = session.entries.filter(e => e.id !== id);
  }

  // Remove empty sessions
  const filtered = sessions.filter(s => s.entries.length > 0);
  await chrome.storage.local.set({ [TRAIL_STORAGE_KEY]: filtered });
  return filtered;
}

export async function clearTrailHistory(): Promise<void> {
  await chrome.storage.local.set({ [TRAIL_STORAGE_KEY]: [] });
}

export function exportTrailData(sessions: BrowseSession[]): void {
  const allEntries: TrailEntry[] = [];
  for (const session of sessions) {
    allEntries.push(...session.entries);
  }

  const data = allEntries.map(entry => ({
    title: entry.title,
    url: entry.url,
    visitedAt: new Date(entry.visitedAt).toISOString(),
    summary: entry.summary,
  }));

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `browse-trail-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Trail Recorder - Records browsing activity in background
export class TrailRecorder {
  private currentSessionId: string;
  private recordingEnabled = true;

  constructor() {
    this.currentSessionId = this.generateId();
    this.startRecording();
  }

  private async startRecording(): Promise<void> {
    // Record current page
    await this.recordPage();

    // Listen for navigation events
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.recordPage();
      });
    }
  }

  public async recordPage(): Promise<void> {
    if (!this.recordingEnabled) return;

    const entry: TrailEntry = {
      id: this.generateId(),
      url: window.location.href,
      title: document.title,
      visitedAt: Date.now(),
      sessionId: this.currentSessionId,
    };

    // Skip certain URLs
    if (this.shouldSkip(entry.url)) return;

    try {
      const result = await chrome.storage.local.get(TRAIL_STORAGE_KEY);
      const sessions: BrowseSession[] = result[TRAIL_STORAGE_KEY] || [];

      // Find or create current session
      let session = sessions.find(s => s.id === this.currentSessionId);
      if (!session) {
        session = {
          id: this.currentSessionId,
          startedAt: Date.now(),
          entries: [],
        };
        sessions.unshift(session);
      }

      // Avoid duplicate entries for the same URL in quick succession
      const lastEntry = session.entries[session.entries.length - 1];
      if (lastEntry && lastEntry.url === entry.url && Date.now() - lastEntry.visitedAt < 5000) {
        return;
      }

      session.entries.push(entry);

      // Keep only last 30 days of history
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const filteredSessions = sessions.filter(s => s.startedAt > thirtyDaysAgo);

      await chrome.storage.local.set({ [TRAIL_STORAGE_KEY]: filteredSessions });
    } catch (error) {
      console.error('Failed to record page:', error);
    }
  }

  private shouldSkip(url: string): boolean {
    const skipPatterns = [
      /^chrome:/,
      /^chrome-extension:/,
      /^about:/,
      /^data:/,
      /^blob:/,
      /^javascript:/,
    ];

    return skipPatterns.some(pattern => pattern.test(url));
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
