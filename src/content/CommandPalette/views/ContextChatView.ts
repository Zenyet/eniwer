// Context Chat View - handles AI chat conversations
import { ChatSession, MenuItem } from '../../../types';
import { escapeHtml, formatAIContent, getLoadingHTML, getThinkingSectionHTML } from '../utils';

export interface ContextChatState {
  chatSession: ChatSession | null;
  isChatStreaming: boolean;
  isQuickAsk: boolean;
}

export function createContextChatState(): ContextChatState {
  return {
    chatSession: null,
    isChatStreaming: false,
    isQuickAsk: false,
  };
}

export function getContextChatViewHTML(
  state: ContextChatState,
  activeCommand: MenuItem | null,
  icons: Record<string, string>,
  getContentHTML: () => string
): string {
  const label = activeCommand?.label || '上下文追问';
  return `
    <div class="glass-search glass-draggable">
      <div class="glass-command-tag" data-action="contextChat">
        <span class="glass-command-tag-icon">${icons.messageCircle}</span>
        <span class="glass-command-tag-label">${escapeHtml(label)}</span>
        <button class="glass-command-tag-close">&times;</button>
      </div>
      <input
        type="text"
        class="glass-input glass-chat-input"
        placeholder="输入问题后按回车..."
        autocomplete="off"
        spellcheck="false"
        ${state.isChatStreaming ? 'disabled' : ''}
      />
      <kbd class="glass-kbd">ESC</kbd>
    </div>
    <div class="glass-divider"></div>
    <div class="glass-body">
      <div class="glass-chat-content">
        ${getContentHTML()}
      </div>
    </div>
    <div class="glass-footer">
      <div class="glass-chat-footer-actions">
        <button class="glass-btn glass-btn-chat-clear">清空对话</button>
      </div>
      <div class="glass-brand">
        <span class="glass-logo">${icons.logo}</span>
      </div>
    </div>
  `;
}

export function getContextChatContentHTML(
  state: ContextChatState,
  icons: Record<string, string>
): string {
  if (!state.chatSession || state.chatSession.messages.length === 0) {
    const emptyText = state.isQuickAsk
      ? '直接输入问题，AI 将为你解答'
      : '开始提问，AI 将基于当前页面内容回答';
    return `
      <div class="glass-chat-empty">
        <div class="glass-chat-empty-icon">${icons.messageCircle}</div>
        <div class="glass-chat-empty-text">${emptyText}</div>
      </div>
    `;
  }

  return state.chatSession.messages.map(msg => {
    const roleLabel = msg.role === 'user' ? '你' : 'AI';
    const roleClass = msg.role === 'user' ? 'glass-chat-msg-user' : 'glass-chat-msg-assistant';

    let contentHtml = '';
    if (msg.references && msg.references.length > 0) {
      const refsHtml = msg.references.map(r =>
        `<div class="glass-chat-reference">"${escapeHtml(r.text)}"</div>`
      ).join('');
      contentHtml = `<div class="glass-chat-references">${refsHtml}</div>`;
    }
    // Add thinking section for assistant messages
    if (msg.role === 'assistant' && msg.thinking) {
      contentHtml += getThinkingSectionHTML(msg.thinking);
    }
    contentHtml += `<div class="glass-chat-msg-text">${formatAIContent(msg.content)}</div>`;

    return `
      <div class="glass-chat-msg ${roleClass}">
        <div class="glass-chat-msg-label">${roleLabel}</div>
        ${contentHtml}
      </div>
    `;
  }).join('');
}

export function getStreamingMessageHTML(): string {
  return `
    <div class="glass-chat-msg glass-chat-msg-assistant glass-chat-streaming">
      <div class="glass-chat-msg-label">AI</div>
      <div class="glass-chat-msg-text">${getLoadingHTML()}</div>
    </div>
  `;
}

export function updateStreamingMessage(
  shadowRoot: ShadowRoot | null,
  content: string
): void {
  const streamingEl = shadowRoot?.querySelector('.glass-chat-streaming .glass-chat-msg-text');
  if (streamingEl) {
    streamingEl.innerHTML = formatAIContent(content);
  }
}

export function scrollChatToBottom(shadowRoot: ShadowRoot | null): void {
  if (!shadowRoot) return;
  requestAnimationFrame(() => {
    const chatContent = shadowRoot.querySelector('.glass-chat-content');
    if (chatContent) {
      chatContent.scrollTop = chatContent.scrollHeight;
    }
  });
}

export interface ContextChatCallbacks {
  onClose: () => void;
  onSendMessage: (input: HTMLInputElement) => Promise<void>;
  onClearChat: () => Promise<void>;
  handleDragStart: (e: MouseEvent) => void;
}

export function bindContextChatEvents(
  shadowRoot: ShadowRoot | null,
  state: ContextChatState,
  callbacks: ContextChatCallbacks
): void {
  if (!shadowRoot) return;

  const input = shadowRoot.querySelector('.glass-chat-input') as HTMLInputElement;
  const searchArea = shadowRoot.querySelector('.glass-search.glass-draggable') as HTMLElement;

  if (searchArea) {
    searchArea.addEventListener('mousedown', callbacks.handleDragStart);
  }

  // Command tag close
  const tagClose = shadowRoot.querySelector('.glass-command-tag-close');
  tagClose?.addEventListener('click', (e) => {
    e.stopPropagation();
    callbacks.onClose();
  });

  // Send message on Enter
  input?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent & { isComposing: boolean }).isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!state.isChatStreaming) {
        callbacks.onSendMessage(input);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      callbacks.onClose();
    }
  });

  // Clear chat
  const clearBtn = shadowRoot.querySelector('.glass-btn-chat-clear');
  clearBtn?.addEventListener('click', async () => {
    await callbacks.onClearChat();
  });

  // Scroll to bottom
  scrollChatToBottom(shadowRoot);
}
