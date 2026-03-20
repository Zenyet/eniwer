// ContextChat Plugin — fully self-contained context chat with streaming & minimize support

import type { Plugin, CommandContributor, ViewContributor, MinimizableContributor, MinimizedPluginData, PluginContext } from '../../plugins';
import type { MenuItem, ChatSession } from '../../types';
import { icons } from '../../icons';
import { t } from '../../i18n';
import {
  loadChatSession,
  saveChatSession,
  createNewChatSession,
  createChatMessage,
  getContextChatSystemPrompt,
  buildConversationPrompt,
  parseReferences,
} from '../../content/ContextChatPanel';
import {
  getContextChatViewHTML as getContextChatViewHTMLFromController,
  getContextChatContentHTML as getContextChatContentHTMLFromController,
  bindContextChatEvents as bindContextChatEventsFromController,
  bindThinkingSections,
  renderStreamingChatContent,
} from '../../content/CommandPalette/controllers';
import { formatAIContent, formatTokenUsage, getThinkingSectionHTML } from '../../content/CommandPalette/utils';
import { abortAllRequests, OnChunkCallback } from '../../utils/ai';
import type { AIResultData } from '../../content/CommandPalette/types';

export class ContextChatPlugin implements Plugin, CommandContributor, ViewContributor, MinimizableContributor {
  readonly id = 'contextChat';
  readonly name = 'Context Chat';
  readonly description = 'plugin.contextChat.description';
  readonly icon = icons.contextChat;
  readonly viewType = 'contextChat';

  private ctx!: PluginContext;

  // Chat state (moved from CommandPalette)
  private chatSession: ChatSession | null = null;
  private isChatStreaming = false;
  private isQuickAsk = false;
  private pendingQuickAskQuestion: string | null = null;
  private pendingQuoteText: string | null = null;
  /** When chat is minimized during streaming, the session ref is kept here */
  private minimizedSessionRef: ChatSession | null = null;

  activate(ctx: PluginContext): void {
    this.ctx = ctx;
  }

  deactivate(): void {
    this.chatSession = null;
    this.isChatStreaming = false;
    this.isQuickAsk = false;
    this.pendingQuickAskQuestion = null;
    this.pendingQuoteText = null;
    this.minimizedSessionRef = null;
  }

  // ========================================
  // CommandContributor
  // ========================================

  getCommands(): MenuItem[] {
    return [];
  }

  handleCommand(action: string): boolean {
    if (action !== 'contextChat') return false;
    this.show();
    return true;
  }

  // ========================================
  // ViewContributor
  // ========================================

  getViewHTML(): string {
    const activeLabel = this.isQuickAsk ? t('chat.quickAskLabel') : t('menu.contextChat');
    return getContextChatViewHTMLFromController({
      activeLabel,
      chatSession: this.chatSession,
      isChatStreaming: this.isChatStreaming,
      isQuickAsk: this.isQuickAsk,
    });
  }

  bindEvents(_shadowRoot: ShadowRoot): void {
    const sr = this.ctx.getShadowRoot();
    if (!sr) return;

    bindContextChatEventsFromController({
      handleDragStart: this.ctx.getHandleDragStart(),
      isChatStreaming: this.isChatStreaming,
      onClearChat: async () => {
        if (!this.chatSession) return;
        this.chatSession.messages = [];
        if (!this.isQuickAsk) {
          await saveChatSession(this.chatSession);
        }
        const content = sr.querySelector('.glass-chat-content');
        if (content) {
          content.innerHTML = this.getContentHTML();
        }
        const chatSaveBtn = sr.querySelector('.glass-btn-chat-save') as HTMLElement;
        if (chatSaveBtn) chatSaveBtn.style.display = 'none';
      },
      onClose: async () => {
        if (this.isChatStreaming && this.chatSession) {
          // If still streaming, minimize instead of discarding
          this.saveAsMinimized();
        }
        this.chatSession = null;
        this.isQuickAsk = false;
        // Return to commands view
        this.ctx.ui.navigateToView('commands');
      },
      onSaveChat: (button) => this.saveChatToKnowledge(button),
      onScrollToBottom: () => this.scrollToBottom(),
      onSendMessage: (input) => this.sendChatMessage(input),
      onStop: (input) => {
        this.isChatStreaming = false;
        abortAllRequests();
        if (input) {
          input.disabled = false;
          input.placeholder = t('chat.inputPlaceholder');
        }
        const chatStopBtn = sr.querySelector('.glass-btn-chat-stop') as HTMLElement;
        if (chatStopBtn) chatStopBtn.style.display = 'none';
        const content = sr.querySelector('.glass-chat-content');
        if (content && this.chatSession) {
          content.innerHTML = this.getContentHTML();
          bindThinkingSections(content);
        }
      },
      shadowRoot: sr,
    });

    // Auto-send pending quick ask question
    requestAnimationFrame(() => {
      if (this.pendingQuickAskQuestion) {
        const chatInput = sr.querySelector('.glass-chat-input') as HTMLInputElement;
        if (chatInput) {
          chatInput.value = this.pendingQuickAskQuestion;
          this.pendingQuickAskQuestion = null;
          void this.sendChatMessage(chatInput);
          return;
        }
        this.pendingQuickAskQuestion = null;
      }
      // Pre-fill quote text if pending
      if (this.pendingQuoteText) {
        const chatInput = sr.querySelector('.glass-chat-input') as HTMLInputElement;
        if (chatInput) {
          chatInput.value = `@ref "${this.pendingQuoteText}" `;
          chatInput.focus();
        }
        this.pendingQuoteText = null;
        return;
      }
      const input = sr.querySelector('.glass-input') as HTMLInputElement;
      input?.focus();
    });
  }

  // ========================================
  // MinimizableContributor
  // ========================================

  saveAsMinimized(): MinimizedPluginData | null {
    if (!this.chatSession) return null;

    const session = this.chatSession;
    const lastUserMsg = [...session.messages].reverse().find(m => m.role === 'user');
    const title = lastUserMsg
      ? lastUserMsg.content.slice(0, 20) + (lastUserMsg.content.length > 20 ? '...' : '')
      : t('chat.conversation');

    const data: MinimizedPluginData = {
      pluginId: this.id,
      title,
      iconHtml: this.isQuickAsk ? icons.messageCircle : icons.contextChat,
      isLoading: this.isChatStreaming,
      pluginData: {
        chatSession: session,
        isQuickAsk: this.isQuickAsk,
        isChatStreaming: this.isChatStreaming,
      },
    };

    // If streaming, keep a ref so onChunk callback can continue updating the session
    if (this.isChatStreaming) {
      this.minimizedSessionRef = session;
    }

    this.chatSession = null;
    this.isChatStreaming = false;

    return data;
  }

  restoreFromMinimized(data: MinimizedPluginData): void {
    const pd = data.pluginData as {
      chatSession: ChatSession;
      isQuickAsk: boolean;
      isChatStreaming: boolean;
    };

    this.chatSession = pd.chatSession;
    this.isQuickAsk = pd.isQuickAsk;
    this.isChatStreaming = pd.isChatStreaming;

    // Clear minimized ref if it matches the restored session
    if (this.minimizedSessionRef === pd.chatSession) {
      this.minimizedSessionRef = null;
    }

    // Set active command and navigate to view
    this.ctx.ui.setActiveCommand({
      id: this.isQuickAsk ? 'quickAsk' : 'contextChat',
      action: 'contextChat',
      label: this.isQuickAsk ? t('chat.quickAskLabel') : t('chat.contextChatLabel'),
      icon: this.isQuickAsk ? icons.messageCircle : icons.contextChat,
      enabled: true,
      order: 0,
    });
    this.ctx.ui.navigateToView('contextChat');
  }

  // ========================================
  // Public API (called by CP / other plugins)
  // ========================================

  /** Start a quick ask session from search bar (called when search query has no matching commands) */
  public startQuickAsk(question: string): void {
    const url = window.location.href;
    this.chatSession = createNewChatSession(url, document.title);
    this.isChatStreaming = false;
    this.isQuickAsk = true;
    this.pendingQuickAskQuestion = question;

    this.ctx.ui.setActiveCommand({
      id: 'quickAsk',
      action: 'contextChat',
      label: t('chat.quickAskLabel'),
      icon: icons.messageCircle,
      enabled: true,
      order: 0,
    });
    this.ctx.ui.navigateToView('contextChat');
  }

  /** Start context chat with a quoted reference text */
  public startWithQuote(text: string): void {
    this.pendingQuoteText = text;
    this.isQuickAsk = false;
    void this.show();
  }

  /** Start quick ask with a quoted reference text */
  public startQuickAskWithQuote(text: string): void {
    const url = window.location.href;
    this.chatSession = createNewChatSession(url, document.title);
    this.isChatStreaming = false;
    this.isQuickAsk = true;
    this.pendingQuickAskQuestion = null;
    this.pendingQuoteText = text;

    this.ctx.ui.setActiveCommand({
      id: 'quickAsk',
      action: 'contextChat',
      label: t('chat.quickAskLabel'),
      icon: icons.messageCircle,
      enabled: true,
      order: 0,
    });
    this.ctx.ui.navigateToView('contextChat');
  }

  // ========================================
  // Internal methods (migrated from CommandPalette)
  // ========================================

  private async show(): Promise<void> {
    const url = window.location.href;
    const existing = await loadChatSession(url);

    if (existing) {
      this.chatSession = existing;
    } else {
      this.chatSession = createNewChatSession(url, document.title);
    }

    this.isChatStreaming = false;
    this.isQuickAsk = false;

    this.ctx.ui.setActiveCommand({
      id: 'contextChat',
      action: 'contextChat',
      label: t('chat.contextChatLabel'),
      icon: icons.contextChat,
      enabled: true,
      order: 0,
    });
    this.ctx.ui.navigateToView('contextChat');
  }

  private getContentHTML(): string {
    return getContextChatContentHTMLFromController(this.chatSession, this.isQuickAsk);
  }

  private scrollToBottom(): void {
    const sr = this.ctx.getShadowRoot();
    if (!sr) return;
    requestAnimationFrame(() => {
      const body = sr.querySelector('.glass-body');
      if (body) {
        body.scrollTop = body.scrollHeight;
      }
    });
  }

  public async sendChatMessage(input: HTMLInputElement): Promise<void> {
    if (!this.chatSession || this.isChatStreaming) return;

    const rawContent = input.value.trim();
    if (!rawContent) return;

    const { cleanContent, references } = parseReferences(rawContent);
    const sr = this.ctx.getShadowRoot();

    // Keep a local reference so streaming continues even if minimized
    const session = this.chatSession;

    // Add user message
    const userMsg = createChatMessage('user', cleanContent, references.length > 0 ? references : undefined);
    session.messages.push(userMsg);

    // Clear input
    input.value = '';
    input.disabled = true;
    input.placeholder = t('chat.aiReplying');

    // Update display
    const content = sr?.querySelector('.glass-chat-content');
    if (content) {
      content.innerHTML = this.getContentHTML();
      bindThinkingSections(content);
    }
    this.scrollToBottom();

    // Add empty assistant message placeholder
    const assistantMsg = createChatMessage('assistant', '');
    session.messages.push(assistantMsg);

    // Render the placeholder
    if (content) {
      renderStreamingChatContent(content, session, this.isQuickAsk);
    }
    this.scrollToBottom();

    this.isChatStreaming = true;

    // Show stop button
    const chatStopBtn = sr?.querySelector('.glass-btn-chat-stop') as HTMLElement;
    if (chatStopBtn) chatStopBtn.style.display = 'flex';

    // Build prompt
    const systemPrompt = this.isQuickAsk
      ? t('chat.quickAskSystemPrompt')
      : getContextChatSystemPrompt(session);
    const conversationHistory = buildConversationPrompt(
      session.messages.slice(0, -1) // Exclude the empty assistant message
    );

    try {
      let _chatStreamRAF: number | null = null;
      let _cachedStreamingTextEl: Element | null = null;
      let _cachedStreamingContainer: Element | null = null;

      const onChunk: OnChunkCallback = (_chunk, fullText, thinking) => {
        // Update data immediately
        const lastMsg = session.messages[session.messages.length - 1];
        if (lastMsg.role === 'assistant') {
          lastMsg.content = fullText;
          if (thinking) {
            lastMsg.thinking = thinking;
          }
        }

        // Batch DOM updates to next animation frame
        if (!_chatStreamRAF) {
          _chatStreamRAF = requestAnimationFrame(() => {
            _chatStreamRAF = null;
            const currentSr = this.ctx.getShadowRoot();

            // Invalidate cache if element is detached
            if (_cachedStreamingTextEl && !_cachedStreamingTextEl.isConnected) {
              _cachedStreamingTextEl = null;
              _cachedStreamingContainer = null;
            }
            if (!_cachedStreamingTextEl) {
              _cachedStreamingTextEl = currentSr?.querySelector('.glass-chat-streaming .glass-chat-msg-text') as Element | null;
              _cachedStreamingContainer = currentSr?.querySelector('.glass-chat-streaming') as Element | null;

              if (!_cachedStreamingTextEl && this.chatSession === session && currentSr) {
                const allAssistantTexts = currentSr.querySelectorAll('.glass-chat-msg-assistant .glass-chat-msg-text');
                _cachedStreamingTextEl = allAssistantTexts[allAssistantTexts.length - 1] || null;
                const allAssistantMsgs = currentSr.querySelectorAll('.glass-chat-msg-assistant');
                _cachedStreamingContainer = allAssistantMsgs[allAssistantMsgs.length - 1] || null;
              }
            }

            if (_cachedStreamingTextEl) {
              _cachedStreamingTextEl.innerHTML = formatAIContent(lastMsg.content);
            }

            // Update thinking section
            if (lastMsg.thinking && _cachedStreamingContainer) {
              let thinkingSection = _cachedStreamingContainer.querySelector('.glass-thinking-section');
              if (!thinkingSection) {
                const textEl = _cachedStreamingContainer.querySelector('.glass-chat-msg-text');
                if (textEl) {
                  textEl.insertAdjacentHTML('beforebegin', getThinkingSectionHTML(lastMsg.thinking));
                  thinkingSection = _cachedStreamingContainer.querySelector('.glass-thinking-section');
                  bindThinkingSections(_cachedStreamingContainer);
                }
              } else {
                const thinkingContent = thinkingSection.querySelector('.glass-thinking-content');
                if (thinkingContent) {
                  thinkingContent.innerHTML = formatAIContent(lastMsg.thinking);
                }
              }
            }

            // Auto-scroll if chat is visible
            if (this.chatSession === session) {
              this.scrollToBottom();
            }
          });
        }
      };

      const response = await this.ctx.ai.call(conversationHistory, systemPrompt, onChunk);

      if (response.success && response.result) {
        const lastMsg = session.messages[session.messages.length - 1];
        if (lastMsg.role === 'assistant') {
          lastMsg.content = response.result;
          if (response.thinking) {
            lastMsg.thinking = response.thinking;
          }
        }
      } else {
        const lastMsg = session.messages[session.messages.length - 1];
        if (lastMsg.role === 'assistant') {
          lastMsg.content = response.error || t('chat.aiRequestFailed');
        }
      }

      // Update token usage display
      const usageSr = this.ctx.getShadowRoot();
      const tokenEl = usageSr?.querySelector('.glass-chat-token-usage') as HTMLElement;
      if (tokenEl) {
        const usageText = formatTokenUsage(response.usage);
        tokenEl.textContent = usageText;
        tokenEl.style.display = usageText ? 'inline' : 'none';
      }

      // Only save chat session for context chat, not quick ask
      if (!this.isQuickAsk) {
        await saveChatSession(session);
      }
    } catch (error) {
      const lastMsg = session.messages[session.messages.length - 1];
      if (lastMsg.role === 'assistant') {
        lastMsg.content = t('aiResult.error', { error: String(error) });
      }
    } finally {
      this.isChatStreaming = false;

      // Hide stop button
      const finalSr = this.ctx.getShadowRoot();
      const chatStopBtn2 = finalSr?.querySelector('.glass-btn-chat-stop') as HTMLElement;
      if (chatStopBtn2) chatStopBtn2.style.display = 'none';

      // Show save button if there's assistant content
      const chatSaveBtn = finalSr?.querySelector('.glass-btn-chat-save') as HTMLElement;
      if (chatSaveBtn && session.messages.some(m => m.role === 'assistant' && m.content)) {
        chatSaveBtn.style.display = 'flex';
      }

      // If this chat was minimized during streaming, update the minimized task badge
      if (this.minimizedSessionRef === session) {
        this.minimizedSessionRef = null;
        this.ctx.minimizedTasks.findAndUpdate(
          this.id,
          (data) => {
            const pd = data as { chatSession: ChatSession };
            return pd.chatSession === session;
          },
          (task) => {
            task.isLoading = false;
            const lastAssistantMsg = session.messages[session.messages.length - 1];
            if (lastAssistantMsg?.role === 'assistant' && lastAssistantMsg.content) {
              task.content = lastAssistantMsg.content;
            }
          }
        );
      }
    }

    // Save/record chat result
    const lastAssistantMsg = session.messages[session.messages.length - 1];
    if (lastAssistantMsg?.role === 'assistant' && lastAssistantMsg.content && !lastAssistantMsg.content.startsWith(t('aiResult.errorPrefix'))) {
      const lastUserMsg = [...session.messages].reverse().find(m => m.role === 'user');
      const chatTitle = lastUserMsg
        ? lastUserMsg.content.slice(0, 20) + (lastUserMsg.content.length > 20 ? '...' : '')
        : (this.isQuickAsk ? t('chat.quickAsk') : t('menu.contextChat'));
      const chatResultData: AIResultData = {
        title: chatTitle,
        content: lastAssistantMsg.content,
        thinking: lastAssistantMsg.thinking,
        isLoading: false,
        resultType: 'general',
        actionType: this.isQuickAsk ? 'quickAsk' : 'contextChat',
        sourceUrl: window.location.href,
        sourceTitle: document.title,
        createdAt: Date.now(),
      };
      const config = this.ctx.getConfig();
      if (config.autoSaveTask) {
        void this.ctx.tasks.autoSave(chatResultData);
      } else {
        this.ctx.tasks.addToUnsavedRecent(chatResultData);
      }
    }

    // Re-render full chat content (only if panel is still showing this chat)
    const finalSr = this.ctx.getShadowRoot();
    const currentContent = finalSr?.querySelector('.glass-chat-content');
    if (this.chatSession === session && currentContent) {
      currentContent.innerHTML = this.getContentHTML();
      bindThinkingSections(currentContent);
    }

    // Re-enable input
    if (this.chatSession === session && finalSr) {
      const currentInput = finalSr.querySelector('.glass-chat-input') as HTMLInputElement;
      if (currentInput) {
        currentInput.disabled = false;
        currentInput.placeholder = t('chat.inputPlaceholder');
        currentInput.focus();
      }
    }
  }

  private async saveChatToKnowledge(btn: HTMLButtonElement): Promise<void> {
    if (!this.chatSession) return;
    const lastAssistantMsg = [...this.chatSession.messages].reverse().find(m => m.role === 'assistant' && m.content);
    if (!lastAssistantMsg) return;

    const lastUserMsg = [...this.chatSession.messages].reverse().find(m => m.role === 'user');
    const title = lastUserMsg
      ? lastUserMsg.content.slice(0, 20) + (lastUserMsg.content.length > 20 ? '...' : '')
      : (this.isQuickAsk ? t('chat.quickAsk') : t('menu.contextChat'));

    try {
      await this.ctx.tasks.autoSave({
        title,
        content: lastAssistantMsg.content,
        thinking: lastAssistantMsg.thinking,
        resultType: 'general',
        actionType: this.isQuickAsk ? 'quickAsk' : 'contextChat',
        sourceUrl: window.location.href,
        sourceTitle: document.title,
        createdAt: Date.now(),
      });
      this.showSaveFeedback(btn);
    } catch (error) {
      console.error('Failed to save chat:', error);
    }
  }

  private showSaveFeedback(btn: HTMLButtonElement): void {
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    `;
    btn.classList.add('saved');
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.classList.remove('saved');
    }, 1500);
  }
}
