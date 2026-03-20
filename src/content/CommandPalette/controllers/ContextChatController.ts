import { ChatSession } from '../../../types';
import { icons } from '../../../icons';
import { t } from '../../../i18n';
import { escapeHtml, formatAIContent, formatTokenUsage, getLoadingHTML, getThinkingSectionHTML } from '../utils';

export interface ContextChatRenderModel {
  activeLabel: string;
  chatSession: ChatSession | null;
  isChatStreaming: boolean;
  isQuickAsk: boolean;
}

export interface ContextChatEventDeps {
  handleDragStart: (e: MouseEvent) => void;
  isChatStreaming: boolean;
  onClearChat: () => Promise<void> | void;
  onClose: () => Promise<void> | void;
  onSaveChat: (button: HTMLButtonElement) => void;
  onScrollToBottom: () => void;
  onSendMessage: (input: HTMLInputElement) => Promise<void> | void;
  onStop: (input: HTMLInputElement | null) => void;
  shadowRoot: ShadowRoot;
}

export function getContextChatViewHTML(model: ContextChatRenderModel): string {
  const { activeLabel, chatSession, isChatStreaming, isQuickAsk } = model;

  return `
    <div class="glass-search glass-draggable">
      <div class="glass-command-tag" data-action="contextChat">
        <span class="glass-command-tag-icon">${isQuickAsk ? icons.messageCircle : icons.contextChat}</span>
        <span class="glass-command-tag-label">${escapeHtml(activeLabel)}</span>
        <button class="glass-command-tag-close">&times;</button>
      </div>
      <input
        type="text"
        class="glass-input glass-chat-input"
        placeholder="${t('chat.inputPlaceholder')}"
        autocomplete="off"
        spellcheck="false"
        ${isChatStreaming ? 'disabled' : ''}
      />
      <button class="glass-header-btn glass-btn-stop glass-btn-chat-stop" title="${t('common.abort')}" style="display: ${isChatStreaming ? 'flex' : 'none'}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="6" y="6" width="12" height="12" rx="2"></rect>
        </svg>
      </button>
      <kbd class="glass-kbd">ESC</kbd>
    </div>
    <div class="glass-divider"></div>
    <div class="glass-body">
      <div class="glass-chat-content">
        ${getContextChatContentHTML(chatSession, isQuickAsk)}
      </div>
    </div>
    <div class="glass-footer">
      <div class="glass-chat-footer-actions">
        <button class="glass-btn glass-btn-chat-clear">${t('chat.clearChat')}</button>
        <button class="glass-footer-btn glass-btn-chat-save" title="${t('common.save')}" style="display: ${chatSession?.messages?.some((m) => m.role === 'assistant' && m.content) && !isChatStreaming ? 'flex' : 'none'}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
              <polyline points="17 21 17 13 7 13 7 21"></polyline>
              <polyline points="7 3 7 8 15 8"></polyline>
            </svg>
          </button>
        <span class="glass-token-usage glass-chat-token-usage" style="display: none"></span>
      </div>
      <div class="glass-brand">
        <span class="glass-logo">${icons.logo}</span>
      </div>
    </div>
  `;
}

export function getContextChatContentHTML(chatSession: ChatSession | null, isQuickAsk: boolean): string {
  if (!chatSession || chatSession.messages.length === 0) {
    const emptyText = isQuickAsk ? t('chat.emptyQuickAsk') : t('chat.emptyContextChat');
    return `
      <div class="glass-chat-empty">
        <div class="glass-chat-empty-icon">${isQuickAsk ? icons.messageCircle : icons.contextChat}</div>
        <div class="glass-chat-empty-text">${emptyText}</div>
      </div>
    `;
  }

  return chatSession.messages.map((message) => {
    const roleLabel = message.role === 'user' ? t('chat.roleUser') : t('chat.roleAI');
    const roleClass = message.role === 'user' ? 'glass-chat-msg-user' : 'glass-chat-msg-assistant';

    let contentHtml = '';
    if (message.references && message.references.length > 0) {
      const refsHtml = message.references
        .map((reference) => `<div class="glass-chat-reference">"${escapeHtml(reference.text)}"</div>`)
        .join('');
      contentHtml = `<div class="glass-chat-references">${refsHtml}</div>`;
    }

    if (message.role === 'assistant' && message.thinking) {
      contentHtml += getThinkingSectionHTML(message.thinking);
    }
    contentHtml += `<div class="glass-chat-msg-text">${formatAIContent(message.content)}</div>`;

    return `
      <div class="glass-chat-msg ${roleClass}">
        <div class="glass-chat-msg-label">${roleLabel}</div>
        ${contentHtml}
      </div>
    `;
  }).join('');
}

export function bindThinkingSections(container: ParentNode | null): void {
  container?.querySelectorAll('.glass-thinking-section').forEach((section) => {
    const header = section.querySelector('.glass-thinking-header');
    if (header && !header.hasAttribute('data-bound')) {
      header.setAttribute('data-bound', 'true');
      header.addEventListener('click', () => {
        section.classList.toggle('collapsed');
      });
    }
  });
}

export function renderStreamingChatContent(
  container: Element,
  chatSession: ChatSession,
  isQuickAsk: boolean
): void {
  container.innerHTML = getContextChatContentHTML(chatSession, isQuickAsk) + `
    <div class="glass-chat-msg glass-chat-msg-assistant glass-chat-streaming">
      <div class="glass-chat-msg-label">AI</div>
      <div class="glass-chat-msg-text">${getLoadingHTML()}</div>
    </div>
  `;

  const lastMessage = container.querySelector('.glass-chat-msg:nth-last-child(2)');
  if (lastMessage && lastMessage.querySelector('.glass-chat-msg-text')?.textContent === '') {
    lastMessage.remove();
  }
}

export function bindContextChatEvents({
  handleDragStart,
  isChatStreaming,
  onClearChat,
  onClose,
  onSaveChat,
  onScrollToBottom,
  onSendMessage,
  onStop,
  shadowRoot,
}: ContextChatEventDeps): void {
  const input = shadowRoot.querySelector('.glass-chat-input') as HTMLInputElement | null;
  const searchArea = shadowRoot.querySelector('.glass-search.glass-draggable') as HTMLElement | null;

  searchArea?.addEventListener('mousedown', handleDragStart);

  shadowRoot.querySelector('.glass-command-tag-close')?.addEventListener('click', (event) => {
    event.stopPropagation();
    void onClose();
  });

  input?.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!isChatStreaming) {
        void onSendMessage(input);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      void onClose();
    }
  });

  shadowRoot.querySelector('.glass-btn-chat-clear')?.addEventListener('click', () => {
    void onClearChat();
  });

  const saveButton = shadowRoot.querySelector('.glass-btn-chat-save') as HTMLButtonElement | null;
  saveButton?.addEventListener('click', () => {
    onSaveChat(saveButton);
  });

  shadowRoot.querySelector('.glass-btn-chat-stop')?.addEventListener('click', () => {
    onStop(input);
  });

  onScrollToBottom();
  bindThinkingSections(shadowRoot.querySelector('.glass-chat-content'));
}
