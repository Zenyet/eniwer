// Context Chat - Multi-turn conversation with page context
import { ChatMessage, ChatSession } from '../types';

const CHAT_STORAGE_KEY = 'thecircle_chat_sessions';
const MAX_SESSIONS = 100;

// Helper functions for CommandPalette to use

export async function loadChatSession(url: string): Promise<ChatSession | null> {
  const sessions = await loadChatSessions();
  return sessions.find(s => s.url === url) || null;
}

export async function loadChatSessions(): Promise<ChatSession[]> {
  try {
    const result = await chrome.storage.local.get(CHAT_STORAGE_KEY);
    return result[CHAT_STORAGE_KEY] || [];
  } catch {
    return [];
  }
}

export async function saveChatSession(session: ChatSession): Promise<void> {
  const sessions = await loadChatSessions();
  const index = sessions.findIndex(s => s.id === session.id);

  session.updatedAt = Date.now();

  if (index >= 0) {
    sessions[index] = session;
  } else {
    sessions.push(session);
  }

  // LRU: keep only the most recent MAX_SESSIONS
  const sorted = sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  const trimmed = sorted.slice(0, MAX_SESSIONS);
  await chrome.storage.local.set({ [CHAT_STORAGE_KEY]: trimmed });
}

export async function clearChatSession(sessionId: string): Promise<void> {
  const sessions = await loadChatSessions();
  const session = sessions.find(s => s.id === sessionId);
  if (session) {
    session.messages = [];
    session.updatedAt = Date.now();
    await chrome.storage.local.set({ [CHAT_STORAGE_KEY]: sessions });
  }
}

export function createNewChatSession(url: string, title: string): ChatSession {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    url,
    title,
    messages: [],
    pageContext: document.body.innerText.slice(0, 10000),
    updatedAt: Date.now(),
  };
}

export function createChatMessage(role: 'user' | 'assistant', content: string, references?: { text: string }[]): ChatMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    role,
    content,
    timestamp: Date.now(),
    references,
  };
}

export function getContextChatSystemPrompt(session: ChatSession): string {
  return `You are a helpful assistant answering questions about a webpage.

Page Title: ${session.title}
Page URL: ${session.url}

Page Content (truncated):
${session.pageContext}

Instructions:
- Answer questions based on the page content above
- If the answer is not in the content, say so
- Be concise but thorough
- Use the same language as the user's question
- If the user references specific text with @"...", pay special attention to that text`;
}

export function buildConversationPrompt(messages: ChatMessage[]): string {
  return messages
    .map(m => {
      let content = m.content;
      if (m.references && m.references.length > 0) {
        content = `[Referenced text: ${m.references.map(r => `"${r.text}"`).join(', ')}]\n${content}`;
      }
      return `${m.role === 'user' ? 'User' : 'Assistant'}: ${content}`;
    })
    .join('\n\n');
}

export function parseReferences(content: string): { text: string; cleanContent: string; references: { text: string }[] } {
  const references: { text: string }[] = [];
  const refRegex = /@"([^"]+)"/g;
  let match;
  while ((match = refRegex.exec(content)) !== null) {
    references.push({ text: match[1] });
  }
  const cleanContent = content.replace(refRegex, '').trim() || content;
  return { text: content, cleanContent, references };
}
