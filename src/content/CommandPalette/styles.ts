// Command Palette Styles - Apple Liquid Glass Design System
export function getStyles(): string {
  return `
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      /* Transpglass-footer-btn glass-btn-export-knowledgearent overlay to capture clicks outside panel */
      .glass-overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
      }

      /* ========================================
         Apple Liquid Glass Design System
         Authentic iOS 26 / visionOS aesthetics
         ======================================== */

      :host {
        /* Dark mode - Primary palette */
        --glass-bg: rgba(28, 28, 30, 0.72);
        --glass-bg-elevated: rgba(44, 44, 46, 0.65);
        --glass-bg-hover: rgba(255, 255, 255, 0.08);
        --glass-bg-selected: rgba(255, 255, 255, 0.12);
        --glass-border: rgba(255, 255, 255, 0.08);
        --glass-border-strong: rgba(255, 255, 255, 0.15);
        --glass-divider: rgba(255, 255, 255, 0.06);

        /* Text hierarchy */
        --text-primary: rgba(255, 255, 255, 0.92);
        --text-secondary: rgba(255, 255, 255, 0.55);
        --text-tertiary: rgba(255, 255, 255, 0.35);

        /* Shadows - subtle depth */
        --shadow-panel:
          0 0 0 0.5px rgba(255, 255, 255, 0.1),
          0 24px 80px -12px rgba(0, 0, 0, 0.5),
          0 12px 40px -8px rgba(0, 0, 0, 0.3);
        --shadow-item: 0 1px 3px rgba(0, 0, 0, 0.12);

        /* Blur values */
        --blur-panel: 40px;
        --blur-overlay: 8px;

        /* Timing */
        --duration-fast: 150ms;
        --duration-normal: 250ms;
        --ease-out: cubic-bezier(0.25, 0.46, 0.45, 0.94);
        --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      /* Light mode overrides */
      .light {
        --glass-bg: rgba(255, 255, 255, 0.72);
        --glass-bg-elevated: rgba(255, 255, 255, 0.85);
        --glass-bg-hover: rgba(0, 0, 0, 0.04);
        --glass-bg-selected: rgba(0, 0, 0, 0.08);
        --glass-border: rgba(0, 0, 0, 0.06);
        --glass-border-strong: rgba(0, 0, 0, 0.12);
        --glass-divider: rgba(0, 0, 0, 0.05);

        --text-primary: rgba(0, 0, 0, 0.88);
        --text-secondary: rgba(0, 0, 0, 0.50);
        --text-tertiary: rgba(0, 0, 0, 0.30);

        --shadow-panel:
          0 0 0 0.5px rgba(0, 0, 0, 0.08),
          0 24px 80px -12px rgba(0, 0, 0, 0.18),
          0 12px 40px -8px rgba(0, 0, 0, 0.1);
      }

      /* ========================================
         Main Panel - Liquid Glass container
         ======================================== */
      .glass-panel {
        /* Reset inherited styles to prevent page style pollution */
        text-align: left;
        line-height: normal;
        letter-spacing: normal;
        word-spacing: normal;
        text-transform: none;
        text-indent: 0;
        text-shadow: none;
        direction: ltr;
        white-space: normal;
        cursor: default;
        visibility: visible;

        position: fixed;
        top: 18%;
        left: 50%;
        transform: translateX(-50%);
        width: 520px;
        max-width: calc(100vw - 40px);
        max-height: 65vh;

        background: var(--glass-bg);
        backdrop-filter: blur(var(--blur-panel)) saturate(180%);
        -webkit-backdrop-filter: blur(var(--blur-panel)) saturate(180%);

        border: 0.5px solid var(--glass-border-strong);
        border-radius: 18px;
        box-shadow: var(--shadow-panel);

        display: flex;
        flex-direction: column;
        overflow: hidden;
        z-index: 2147483647;

        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif;
        font-feature-settings: "kern" 1, "liga" 1;
        -webkit-font-smoothing: antialiased;
        transition: opacity 120ms ease-out;
      }

      .glass-panel.glass-panel-enter {
        animation: panelIn var(--duration-normal) var(--ease-spring);
      }

      .glass-panel.glass-panel-enter-restored {
        animation: panelInRestored var(--duration-normal) var(--ease-spring);
      }

      @keyframes panelIn {
        from {
          opacity: 0;
          transform: translateX(-50%) translateY(-16px) scale(0.97);
        }
        to {
          opacity: 1;
          transform: translateX(-50%) translateY(0) scale(1);
        }
      }

      @keyframes panelInRestored {
        from {
          opacity: 0;
          transform: translateY(-16px) scale(0.97);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }

      .glass-panel-exit {
        animation: panelOut var(--duration-fast) var(--ease-out) forwards;
      }

      @keyframes panelOut {
        from {
          opacity: 1;
          transform: translateX(-50%) translateY(0) scale(1);
        }
        to {
          opacity: 0;
          transform: translateX(-50%) translateY(-8px) scale(0.98);
        }
      }

      .glass-panel-exit-dragged {
        animation: panelOutDragged var(--duration-fast) var(--ease-out) forwards;
      }

      @keyframes panelOutDragged {
        from {
          opacity: 1;
          transform: scale(1);
        }
        to {
          opacity: 0;
          transform: translateY(-8px) scale(0.98);
        }
      }

      /* ========================================
         Search Bar
         ======================================== */
      .glass-search {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
      }

      .glass-search.glass-draggable {
        cursor: move;
        user-select: none;
      }

      .glass-search-icon {
        color: var(--text-tertiary);
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 26px;
        width: 18px;
      }

      .glass-search-icon svg {
        width: 18px;
        height: 18px;
      }

      /* Command Tag (active command indicator) */
      .glass-command-tag {
        display: flex;
        align-items: center;
        gap: 6px;
        height: 26px;
        padding: 0 8px 0 6px;
        background: var(--glass-bg-selected);
        border: 0.5px solid var(--glass-border-strong);
        border-radius: 8px;
        flex-shrink: 0;
        cursor: default;
        box-sizing: border-box;
      }

      .glass-command-tag-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-primary);
      }

      .glass-command-tag-icon svg {
        width: 14px;
        height: 14px;
      }

      .glass-command-tag-label {
        font-size: 13px;
        font-weight: 500;
        color: var(--text-primary);
        white-space: nowrap;
      }

      .glass-command-tag-close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        border: none;
        background: transparent;
        color: var(--text-tertiary);
        cursor: pointer;
        border-radius: 4px;
        font-size: 14px;
        line-height: 1;
        margin-left: 2px;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-command-tag-close:hover {
        color: var(--text-primary);
      }

      .glass-input {
        flex: 1;
        background: transparent;
        border: none;
        outline: none;
        font-size: 16px;
        font-weight: 400;
        letter-spacing: -0.01em;
        color: var(--text-primary);
        font-family: inherit;
      }

      .glass-input:disabled {
        cursor: default;
      }

      .glass-input::placeholder {
        color: var(--text-tertiary);
      }

      .glass-kbd {
        font-size: 11px;
        font-weight: 500;
        letter-spacing: 0.02em;
        color: var(--text-tertiary);
        background: var(--glass-bg-hover);
        border: 0.5px solid var(--glass-border);
        height: 26px;
        padding: 0 7px;
        border-radius: 5px;
        font-family: "SF Mono", ui-monospace, monospace;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
      }

      /* ========================================
         AI Content Area (unified interface)
         ======================================== */
      .glass-ai-content-area {
        padding: 16px;
        min-height: 100px;
        contain: layout style;
      }

      .glass-ai-content-area .glass-ai-content {
        font-size: 14px;
        line-height: 1.6;
        color: var(--text-primary);
      }

      .glass-ai-content-area .glass-ai-content code {
        background: var(--glass-bg-hover);
        padding: 2px 6px;
        border-radius: 4px;
        font-family: "SF Mono", ui-monospace, monospace;
        font-size: 13px;
      }

      /* Footer action buttons */
      .glass-ai-footer-actions {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .glass-footer-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 0;
        border: 0.5px solid var(--glass-border);
        background: var(--glass-bg-hover);
        border-radius: 8px;
        color: var(--text-secondary);
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-footer-btn:hover {
        background: var(--glass-bg-selected);
        color: var(--text-primary);
      }

      .glass-footer-btn svg {
        width: 16px;
        height: 16px;
      }

      .glass-footer-btn.glass-btn-stop {
        color: #ff6b6b;
        border-color: rgba(255, 107, 107, 0.3);
      }

      .glass-footer-btn.glass-btn-stop:hover {
        background: rgba(255, 107, 107, 0.15);
        color: #ff5252;
      }

      .glass-footer-btn.copied,
      .glass-footer-btn.saved {
        color: #4ade80;
        border-color: rgba(74, 222, 128, 0.3);
      }

      /* ========================================
         Divider
         ======================================== */
      .glass-divider {
        height: 0.5px;
        background: var(--glass-divider);
        margin: 0 16px;
      }

      /* ========================================
         Commands List
         ======================================== */
      .glass-body {
        flex: 1;
        overflow-y: auto;
        overscroll-behavior: contain;
        /* Prevent flicker during scroll by creating a compositing layer */
        transform: translateZ(0);
        -webkit-transform: translateZ(0);
        contain: layout style;
      }

      .glass-commands {
        padding: 8px;
      }

      .glass-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        border-radius: 10px;
        cursor: pointer;
        transition:
          background var(--duration-fast) var(--ease-out),
          transform var(--duration-fast) var(--ease-out);
      }

      .glass-item:hover {
        background: var(--glass-bg-hover);
      }

      .glass-item.selected {
        background: var(--glass-bg-selected);
      }

      .glass-item:active {
        transform: scale(0.98);
      }

      .glass-item-icon {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--glass-bg-elevated);
        border: 0.5px solid var(--glass-border);
        border-radius: 8px;
        color: var(--text-primary);
        flex-shrink: 0;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-item.selected .glass-item-icon {
        background: var(--text-primary);
        border-color: transparent;
        color: var(--glass-bg);
      }

      .glass-item-icon svg {
        width: 16px;
        height: 16px;
      }

      .glass-item-label {
        flex: 1;
        font-size: 14px;
        font-weight: 450;
        letter-spacing: -0.01em;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .glass-item-badge {
        font-size: 10px;
        font-weight: 500;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        color: var(--text-tertiary);
        background: var(--glass-bg-hover);
        padding: 2px 6px;
        border-radius: 4px;
      }

      .glass-item-key {
        font-size: 11px;
        font-weight: 500;
        color: var(--text-tertiary);
        background: var(--glass-bg-hover);
        border: 0.5px solid var(--glass-border);
        padding: 2px 6px;
        border-radius: 5px;
        font-family: "SF Mono", ui-monospace, monospace;
        min-width: 20px;
        text-align: center;
      }

      /* ========================================
         Empty State
         ======================================== */
      .glass-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 40px 20px;
        color: var(--text-tertiary);
        font-size: 14px;
      }

      /* ========================================
         Global Search Results
         ======================================== */
      .glass-search-section {
        margin-bottom: 12px;
      }

      .glass-search-section:last-child {
        margin-bottom: 0;
      }

      .glass-search-section-title {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--text-tertiary);
        padding: 6px 12px;
        margin-bottom: 4px;
      }

      .glass-search-section-title svg {
        width: 12px;
        height: 12px;
        opacity: 0.7;
      }

      .glass-search-result {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 10px;
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-search-result:hover {
        background: var(--glass-bg-hover);
      }

      .glass-search-result-icon {
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--glass-bg-elevated);
        border: 0.5px solid var(--glass-border);
        border-radius: 7px;
        color: var(--text-secondary);
        flex-shrink: 0;
      }

      .glass-search-result-icon svg {
        width: 14px;
        height: 14px;
      }

      .glass-search-result-content {
        flex: 1;
        min-width: 0;
      }

      .glass-search-result-title {
        font-size: 13px;
        font-weight: 500;
        color: var(--text-primary);
        margin-bottom: 2px;
      }

      .glass-search-result-preview {
        font-size: 12px;
        color: var(--text-secondary);
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
        overflow: hidden;
        margin-bottom: 2px;
      }

      .glass-search-result-meta {
        font-size: 11px;
        color: var(--text-tertiary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .glass-search-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 20px;
        color: var(--text-tertiary);
        font-size: 13px;
      }

      .glass-search-loading-spinner {
        width: 14px;
        height: 14px;
        border: 2px solid var(--glass-border);
        border-top-color: var(--text-secondary);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      /* ========================================
         Footer
         ======================================== */
      .glass-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 16px;
        border-top: 0.5px solid var(--glass-divider);
      }

      .glass-hints {
        display: flex;
        gap: 14px;
        font-size: 12px;
        color: var(--text-tertiary);
      }

      .glass-hints span {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .glass-hints kbd {
        font-size: 10px;
        font-weight: 500;
        color: var(--text-tertiary);
        background: var(--glass-bg-hover);
        border: 0.5px solid var(--glass-border);
        padding: 2px 5px;
        border-radius: 4px;
        font-family: "SF Mono", ui-monospace, monospace;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .glass-hints kbd svg {
        display: block;
      }

      .glass-brand {
        display: flex;
        align-items: center;
      }

      .glass-logo {
        width: 16px;
        height: 16px;
        color: var(--text-tertiary);
        opacity: 0.6;
      }

      .glass-logo svg {
        width: 100%;
        height: 100%;
      }

      /* ========================================
         Scrollbar - Hidden to avoid layout asymmetry
         Content is still scrollable via trackpad/mouse wheel
         ======================================== */
      .glass-body,
      .glass-ai-content,
      .glass-ai-result-body,
      .glass-settings-body,
      .glass-thinking-content,
      .glass-backup-list,
      .glass-screenshot-body,
      .glass-screenshot-result-text {
        scrollbar-width: none;
      }
      .glass-body::-webkit-scrollbar,
      .glass-ai-content::-webkit-scrollbar,
      .glass-ai-result-body::-webkit-scrollbar,
      .glass-settings-body::-webkit-scrollbar,
      .glass-thinking-content::-webkit-scrollbar,
      .glass-backup-list::-webkit-scrollbar,
      .glass-screenshot-body::-webkit-scrollbar,
      .glass-screenshot-result-text::-webkit-scrollbar {
        display: none;
      }

      /* ========================================
         Responsive
         ======================================== */
      @media (max-width: 580px) {
        .glass-panel {
          top: 12%;
          width: calc(100vw - 24px);
          max-height: 75vh;
          border-radius: 14px;
        }

        .glass-hints {
          display: none;
        }

        .glass-item-key {
          display: none;
        }

        .glass-item-badge {
          display: none;
        }
      }

      /* ========================================
         Reduced Motion
         ======================================== */
      @media (prefers-reduced-motion: reduce) {
        .glass-panel,
        .glass-item,
        .glass-item-icon {
          animation: none;
          transition: none;
        }
      }

      /* ========================================
         Header with Back Button
         ======================================== */
      .glass-header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
      }

      .glass-header.glass-draggable {
        cursor: move;
        user-select: none;
      }

      .glass-header.glass-draggable:active {
        cursor: grabbing;
      }

      .glass-back-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        background: var(--glass-bg-hover);
        border-radius: 8px;
        color: var(--text-primary);
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-back-btn:hover {
        background: var(--glass-bg-selected);
      }

      .glass-header-title {
        flex: 1;
        font-size: 16px;
        font-weight: 600;
        color: var(--text-primary);
      }

      .glass-header-actions {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .glass-header-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        background: var(--glass-bg-hover);
        border-radius: 8px;
        color: var(--text-secondary);
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-header-btn:hover {
        background: var(--glass-bg-selected);
        color: var(--text-primary);
      }

      .glass-header-btn.active {
        background: var(--glass-bg-selected);
        color: var(--text-primary);
      }

      .glass-header-btn svg {
        width: 16px;
        height: 16px;
      }

      .glass-header-btn.glass-btn-stop {
        color: #ff6b6b;
      }

      .glass-header-btn.glass-btn-stop:hover {
        background: rgba(255, 107, 107, 0.15);
        color: #ff5252;
      }

      .glass-header-btn.copied {
        color: #4ade80;
      }

      .glass-minimize-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        background: var(--glass-bg-hover);
        border-radius: 8px;
        color: var(--text-secondary);
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-minimize-btn:hover {
        background: var(--glass-bg-selected);
        color: var(--text-primary);
      }

      /* ========================================
         Dragging State
         ======================================== */
      .glass-panel-dragging {
        transition: none !important;
        user-select: none;
      }

      /* ========================================
         Minimized Icon
         ======================================== */
      .glass-minimized-icon {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: var(--glass-bg);
        backdrop-filter: blur(var(--blur-panel)) saturate(180%);
        -webkit-backdrop-filter: blur(var(--blur-panel)) saturate(180%);
        border: 0.5px solid var(--glass-border-strong);
        box-shadow: var(--shadow-panel);
        cursor: pointer;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all var(--duration-fast) var(--ease-out);
        animation: minimizedIn var(--duration-normal) var(--ease-spring);
      }

      @keyframes minimizedIn {
        from {
          opacity: 0;
          transform: scale(0.5);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }

      .glass-minimized-icon:hover {
        transform: scale(1.08);
        box-shadow:
          0 0 0 0.5px rgba(255, 255, 255, 0.15),
          0 12px 40px -8px rgba(0, 0, 0, 0.4);
      }

      .glass-minimized-icon:hover .glass-minimized-tooltip {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
        pointer-events: auto;
      }

      .glass-minimized-icon-inner {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-primary);
      }

      .glass-minimized-icon-inner svg {
        width: 20px;
        height: 20px;
      }

      .glass-minimized-loading {
        position: absolute;
        inset: -4px;
        border: 2px solid transparent;
        border-top-color: var(--text-primary);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      .glass-minimized-tooltip {
        position: absolute;
        bottom: calc(100% + 8px);
        left: 50%;
        transform: translateX(-50%) translateY(4px);
        padding: 6px 12px;
        background: var(--glass-bg-elevated);
        border: 0.5px solid var(--glass-border);
        border-radius: 8px;
        font-size: 12px;
        font-weight: 500;
        color: var(--text-primary);
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: all var(--duration-fast) var(--ease-out);
        box-shadow: var(--shadow-item);
      }

      /* ========================================
         Minimized Tasks Section (in Commands View)
         ======================================== */
      .glass-minimized-section:empty {
        display: none;
      }

      .glass-minimized-section {
        border-top: 0.5px solid var(--glass-divider);
        padding: 8px 0;
      }

      .glass-section-label {
        padding: 4px 16px 8px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--text-tertiary);
      }

      .glass-minimized-task {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        cursor: pointer;
        border-radius: 10px;
        margin: 0 8px 4px;
        transition: background var(--duration-fast) var(--ease-out);
      }

      .glass-minimized-task:hover {
        background: var(--glass-bg-hover);
      }

      .glass-task-icon {
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--glass-bg-elevated);
        border: 0.5px solid var(--glass-border);
        border-radius: 10px;
        color: var(--text-primary);
        flex-shrink: 0;
      }

      .glass-task-icon svg {
        width: 18px;
        height: 18px;
      }

      .glass-task-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .glass-task-title {
        font-size: 14px;
        font-weight: 500;
        letter-spacing: -0.01em;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .glass-task-meta {
        font-size: 12px;
        color: var(--text-tertiary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .glass-minimized-task-loading {
        width: 14px;
        height: 14px;
        border: 1.5px solid var(--glass-border);
        border-top-color: var(--text-primary);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        flex-shrink: 0;
      }

      .glass-minimized-close {
        width: 20px;
        height: 20px;
        border: none;
        background: transparent;
        color: var(--text-tertiary);
        cursor: pointer;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        font-size: 16px;
        line-height: 1;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-minimized-close:hover {
        color: #ff6b6b;
      }

      /* ========================================
         Recent Tasks Section (Saved Tasks from IndexedDB)
         ======================================== */
      .glass-recent-section:empty {
        display: none;
      }

      .glass-recent-section {
        border-top: 0.5px solid var(--glass-divider);
        padding: 8px 0;
      }

      .glass-recent-task {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        cursor: pointer;
        border-radius: 10px;
        margin: 0 8px 4px;
        transition: background var(--duration-fast) var(--ease-out);
      }

      .glass-recent-task:hover {
        background: var(--glass-bg-hover);
      }

      .glass-recent-close {
        width: 20px;
        height: 20px;
        border: none;
        background: transparent;
        color: var(--text-tertiary);
        cursor: pointer;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        font-size: 16px;
        line-height: 1;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-recent-close:hover {
        color: #ff6b6b;
      }

      /* ========================================
         AI Result View
         ======================================== */
      .glass-source-info {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        background: var(--glass-bg-hover);
        border-bottom: 0.5px solid var(--glass-divider);
      }

      .glass-source-icon {
        color: var(--text-tertiary);
        flex-shrink: 0;
        display: flex;
        align-items: center;
      }

      .glass-source-content {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
      }

      .glass-source-link {
        color: var(--text-secondary);
        text-decoration: none;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        transition: color var(--duration-fast) var(--ease-out);
      }

      .glass-source-link:hover {
        color: var(--text-primary);
        text-decoration: underline;
      }

      .glass-source-title {
        color: var(--text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .glass-source-meta {
        color: var(--text-tertiary);
        white-space: nowrap;
        flex-shrink: 0;
      }

      .glass-source-meta::before {
        content: '·';
        margin-right: 8px;
      }

      .glass-ai-result-body {
        padding: 16px;
      }

      .glass-ai-content {
        font-size: 14px;
        line-height: 1.6;
        color: var(--text-primary);
      }

      .glass-ai-content code {
        background: var(--glass-bg-hover);
        padding: 2px 6px;
        border-radius: 4px;
        font-family: "SF Mono", ui-monospace, monospace;
        font-size: 13px;
      }

      .glass-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 40px 20px;
        color: var(--text-secondary);
      }

      .glass-spinner {
        width: 24px;
        height: 24px;
        border: 2px solid var(--glass-border);
        border-top-color: var(--text-primary);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .glass-ai-footer {
        padding: 12px 16px;
        border-top: 0.5px solid var(--glass-divider);
      }

      .glass-ai-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }

      .glass-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        border: 0.5px solid var(--glass-border);
        background: var(--glass-bg-hover);
        border-radius: 8px;
        color: var(--text-primary);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
        white-space: nowrap;
      }

      .glass-btn:hover {
        background: var(--glass-bg-selected);
        border-color: var(--glass-border-strong);
      }

      .glass-btn.active {
        background: rgba(59, 130, 246, 0.2);
        border-color: rgba(59, 130, 246, 0.5);
      }

      .glass-btn.copied {
        background: rgba(34, 197, 94, 0.2);
        border-color: rgba(34, 197, 94, 0.5);
      }

      .glass-btn svg {
        width: 14px;
        height: 14px;
      }

      .glass-btn-stop {
        background: rgba(239, 68, 68, 0.1);
        border-color: rgba(239, 68, 68, 0.3);
      }

      .glass-btn-stop:hover {
        background: rgba(239, 68, 68, 0.2);
      }

      /* Compare View */
      .glass-compare-view {
        display: flex;
        gap: 16px;
      }

      .glass-compare-item {
        flex: 1;
        min-width: 0;
      }

      .glass-compare-label {
        font-size: 11px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--text-tertiary);
        margin-bottom: 8px;
      }

      .glass-compare-content {
        font-size: 14px;
        line-height: 1.6;
        color: var(--text-primary);
      }

      .glass-compare-divider {
        width: 1px;
        background: var(--glass-divider);
      }

      /* Thinking Section */
      .glass-thinking-section {
        margin-bottom: 12px;
        border: 1px solid var(--glass-border);
        border-radius: 8px;
        overflow: hidden;
      }

      .glass-thinking-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: var(--glass-bg-hover);
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        color: var(--text-secondary);
        transition: background-color 0.15s ease;
      }

      .glass-thinking-header:hover {
        background: var(--glass-bg-selected);
      }

      .glass-thinking-header svg {
        flex-shrink: 0;
        opacity: 0.7;
      }

      .glass-thinking-header span {
        flex: 1;
      }

      .glass-thinking-chevron {
        transition: transform 0.2s ease;
      }

      .glass-thinking-section.collapsed .glass-thinking-chevron {
        transform: rotate(-90deg);
      }

      .glass-thinking-content {
        padding: 12px;
        font-size: 13px;
        line-height: 1.6;
        color: var(--text-secondary);
        background: var(--glass-bg);
        max-height: 200px;
        overflow-y: auto;
        overscroll-behavior: contain;
        border-top: 1px solid var(--glass-border);
        transform: translateZ(0);
        -webkit-transform: translateZ(0);
      }

      .glass-thinking-section.collapsed .glass-thinking-content {
        display: none;
      }

      .glass-thinking-content code {
        background: var(--glass-bg-hover);
        padding: 2px 6px;
        border-radius: 4px;
        font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
        font-size: 12px;
      }

      .glass-panel-wide {
        width: 680px;
        max-width: calc(100vw - 40px);
      }

      /* Language Select */
      .glass-lang-select {
        appearance: none;
        height: 32px;
        padding: 0 28px 0 10px;
        border: 0.5px solid var(--glass-border);
        background: var(--glass-bg-hover);
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 8px center;
        border-radius: 8px;
        color: var(--text-primary);
        font-size: 13px;
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-lang-select:hover {
        background-color: var(--glass-bg-selected);
        border-color: var(--glass-border-strong);
      }

      /* ========================================
         Settings Views
         ======================================== */
      .glass-settings-flat {
        padding: 0;
      }

      .glass-settings-section {
        padding: 12px 16px;
        border-bottom: 1px solid var(--glass-divider);
      }

      .glass-settings-section:last-child {
        border-bottom: none;
      }

      .glass-settings-section-title {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--text-secondary);
        margin-bottom: 10px;
      }

      .glass-settings-body {
        max-height: 400px;
        overflow-y: auto;
        overscroll-behavior: contain;
      }

      .glass-settings-list {
        padding: 8px;
      }

      .glass-settings-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        border-radius: 10px;
        cursor: pointer;
        transition: background var(--duration-fast) var(--ease-out);
      }

      .glass-settings-item:hover {
        background: var(--glass-bg-hover);
      }

      .glass-settings-icon {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--glass-bg-elevated);
        border: 0.5px solid var(--glass-border);
        border-radius: 8px;
        color: var(--text-primary);
        flex-shrink: 0;
      }

      .glass-settings-icon svg {
        width: 18px;
        height: 18px;
      }

      .glass-settings-label {
        flex: 1;
        font-size: 14px;
        font-weight: 450;
        color: var(--text-primary);
      }

      .glass-settings-arrow {
        color: var(--text-tertiary);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .glass-settings-arrow svg {
        width: 14px;
        height: 14px;
      }

      /* Form Elements */
      .glass-form {
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .glass-form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .glass-form-group + .glass-form-group {
        margin-top: 10px;
      }

      .glass-form-group.glass-form-toggle {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        padding: 4px 0;
        gap: 12px;
      }

      .glass-form-label {
        font-size: 13px;
        font-weight: 500;
        color: var(--text-primary);
      }

      .glass-form-hint {
        font-size: 11px;
        color: var(--text-tertiary);
        line-height: 1.4;
      }

      /* Account settings styles */
      .glass-account-info {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 0;
        margin-bottom: 8px;
      }

      .glass-token-expired-notice {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 10px;
        margin-bottom: 12px;
        border-radius: 6px;
        background: rgba(234, 67, 53, 0.08);
        border: 1px solid rgba(234, 67, 53, 0.2);
        font-size: 12px;
        color: #ea4335;
      }

      .glass-btn-relogin {
        background: none;
        border: none;
        color: #4285F4;
        font-size: 12px;
        cursor: pointer;
        padding: 2px 8px;
        border-radius: 4px;
        font-weight: 500;
      }

      .glass-btn-relogin:hover {
        background: rgba(66, 133, 244, 0.1);
      }

      .glass-account-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        overflow: hidden;
        flex-shrink: 0;
      }

      .glass-account-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .glass-account-avatar-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        font-weight: 600;
        font-size: 16px;
      }

      .glass-account-details {
        flex: 1;
        min-width: 0;
      }

      .glass-account-name {
        font-size: 14px;
        font-weight: 500;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .glass-account-email {
        font-size: 12px;
        color: var(--text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .glass-account-login {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .glass-btn-google {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        width: 100%;
        padding: 10px 16px;
        background: var(--glass-bg-elevated);
        border: 1px solid var(--glass-border);
        border-radius: 8px;
        color: var(--text-primary);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-btn-google:hover {
        background: var(--glass-bg-hover);
        border-color: var(--glass-border-strong);
      }

      .glass-btn-google svg {
        flex-shrink: 0;
      }

      .glass-btn-logout {
        padding: 8px;
        background: transparent;
        border: 1px solid var(--glass-border);
        border-radius: 6px;
        color: var(--text-secondary);
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .glass-btn-logout:hover {
        background: rgba(239, 68, 68, 0.1);
        border-color: rgba(239, 68, 68, 0.3);
        color: #ef4444;
      }

      .glass-sync-settings {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .glass-sync-actions {
        justify-content: space-between;
        gap: 8px;
      }

      .glass-sync-actions .glass-btn {
        padding: 5px 10px;
        font-size: 12px;
      }

      .glass-sync-actions .glass-btn svg {
        width: 12px;
        height: 12px;
      }

      /* Sync options chips */
      .glass-sync-options {
        padding: 2px 0 4px;
      }

      .glass-sync-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .glass-sync-chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 10px;
        border-radius: 14px;
        background: var(--glass-bg-hover);
        border: 1px solid var(--glass-border);
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
        user-select: none;
      }

      .glass-sync-chip:hover {
        background: var(--glass-bg-selected);
        border-color: var(--glass-border-strong);
      }

      .glass-sync-chip input {
        display: none;
      }

      .glass-sync-chip-label {
        font-size: 12px;
        font-weight: 500;
        color: var(--text-secondary);
        transition: color var(--duration-fast) var(--ease-out);
      }

      .glass-sync-chip-label::before {
        content: "";
        display: inline-block;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        margin-right: 4px;
        background: var(--text-tertiary);
        vertical-align: middle;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-sync-chip input:checked ~ .glass-sync-chip-label {
        color: var(--text-primary);
      }

      .glass-sync-chip input:checked ~ .glass-sync-chip-label::before {
        background: rgba(59, 130, 246, 0.9);
        box-shadow: 0 0 4px rgba(59, 130, 246, 0.4);
      }

      .glass-sync-chip:has(input:checked) {
        border-color: rgba(59, 130, 246, 0.3);
        background: rgba(59, 130, 246, 0.08);
      }

      .glass-backup-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 8px;
        margin-bottom: 2px;
      }

      .glass-backup-refresh-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 6px;
        border: none;
        background: transparent;
        color: var(--text-tertiary);
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-backup-refresh-btn:hover {
        background: var(--glass-bg-hover);
        color: var(--text-primary);
      }

      .glass-backup-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin-top: 4px;
        padding-left: 2px;
      }

      .glass-backup-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 16px 0;
        color: var(--text-tertiary);
        font-size: 12px;
      }

      .glass-backup-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 10px;
        border-radius: 8px;
        background: transparent;
        transition: background var(--duration-fast) var(--ease-out);
      }

      .glass-backup-item:hover {
        background: var(--glass-bg-hover);
      }

      .glass-backup-info {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }

      .glass-backup-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--glass-border-strong);
        flex-shrink: 0;
      }

      .glass-backup-item-latest .glass-backup-dot {
        background: var(--accent-primary);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-primary) 20%, transparent);
      }

      .glass-backup-meta {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
      }

      .glass-backup-time {
        font-size: 12px;
        font-weight: 500;
        color: var(--text-primary);
        line-height: 1.3;
      }

      .glass-backup-label {
        font-size: 10px;
        color: var(--text-tertiary);
        line-height: 1.3;
      }

      .glass-backup-item-latest .glass-backup-label {
        color: var(--accent-primary);
      }

      .glass-backup-actions {
        display: flex;
        gap: 2px;
        align-items: center;
        opacity: 0;
        transition: opacity var(--duration-fast) var(--ease-out);
      }

      .glass-backup-item:hover .glass-backup-actions {
        opacity: 1;
      }

      .glass-backup-action-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        border-radius: 6px;
        border: none;
        background: transparent;
        color: var(--text-secondary);
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-backup-action-btn:hover {
        background: var(--glass-bg-elevated);
        color: var(--text-primary);
      }

      .glass-backup-action-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .glass-backup-action-btn-danger:hover {
        background: rgba(239, 68, 68, 0.1);
        color: #ef4444;
      }

      .glass-backup-item-loading .glass-backup-actions {
        opacity: 1;
      }

      .glass-backup-spinner {
        animation: glass-spin 0.7s linear infinite;
      }

      .glass-btn-secondary {
        background: transparent;
        border: 1px solid var(--glass-border);
      }

      .glass-btn-sync-now {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 8px 12px;
        background: var(--glass-bg-elevated);
        border: 1px solid var(--glass-border);
        border-radius: 6px;
        color: var(--text-primary);
        font-size: 12px;
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-btn-sync-now:hover {
        background: var(--glass-bg-hover);
        border-color: var(--glass-border-strong);
      }

      .glass-btn-sync-now:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .glass-btn-sync-now svg {
        flex-shrink: 0;
      }

      .glass-spinner {
        display: inline-block;
        width: 14px;
        height: 14px;
        border: 2px solid var(--glass-border);
        border-top-color: var(--text-primary);
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
      }

      .glass-select {
        appearance: none;
        width: 100%;
        padding: 8px 32px 8px 10px;
        border: 1px solid var(--glass-border);
        background: var(--glass-bg-hover);
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 10px center;
        border-radius: 6px;
        color: var(--text-primary);
        font-size: 13px;
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
        box-sizing: border-box;
      }

      .glass-select:hover {
        background-color: var(--glass-bg-selected);
        border-color: var(--glass-border-strong);
      }

      .glass-select:focus {
        outline: none;
        border-color: rgba(59, 130, 246, 0.5);
      }

      .glass-input-field {
        width: 100%;
        padding: 8px 10px;
        border: 1px solid var(--glass-border);
        background: var(--glass-bg-hover);
        border-radius: 6px;
        color: var(--text-primary);
        font-size: 13px;
        outline: none;
        transition: all var(--duration-fast) var(--ease-out);
        box-sizing: border-box;
      }

      .glass-input-field:focus {
        border-color: rgba(59, 130, 246, 0.5);
        background: rgba(59, 130, 246, 0.1);
      }

      .glass-input-field::placeholder {
        color: var(--text-tertiary);
      }

      /* Toggle Switch */
      .glass-toggle {
        position: relative;
        display: inline-block;
        width: 36px;
        height: 20px;
        flex-shrink: 0;
      }

      .glass-toggle input {
        opacity: 0;
        width: 0;
        height: 0;
      }

      .glass-toggle-slider {
        position: absolute;
        cursor: pointer;
        inset: 0;
        background: var(--glass-bg-hover);
        border: 0.5px solid var(--glass-border);
        border-radius: 20px;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-toggle-slider::before {
        content: "";
        position: absolute;
        height: 13px;
        width: 13px;
        left: 2px;
        bottom: 3px;
        background: var(--text-primary);
        border-radius: 50%;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-toggle input:checked + .glass-toggle-slider {
        background: rgba(59, 130, 246, 0.8);
        border-color: rgba(59, 130, 246, 0.8);
      }

      .glass-toggle input:checked + .glass-toggle-slider::before {
        transform: translateX(16px);
        background: white;
      }

      .glass-toggle-small {
        width: 32px;
        height: 18px;
      }

      .glass-toggle-small .glass-toggle-slider::before {
        height: 12px;
        width: 12px;
      }

      .glass-toggle-small input:checked + .glass-toggle-slider::before {
        transform: translateX(14px);
      }

      /* Menu Management */
      .glass-menu-list {
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .glass-menu-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        background: var(--glass-bg-hover);
        border: 0.5px solid var(--glass-border);
        border-radius: 10px;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-menu-item:hover {
        background: var(--glass-bg-selected);
      }

      .glass-menu-item.dragging {
        opacity: 0.5;
      }

      .glass-menu-item.drag-over {
        border-color: rgba(59, 130, 246, 0.5);
        background: rgba(59, 130, 246, 0.1);
      }

      .glass-menu-drag {
        color: var(--text-tertiary);
        cursor: grab;
        font-size: 12px;
        letter-spacing: 2px;
      }

      .glass-menu-icon {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-primary);
      }

      .glass-menu-icon svg {
        width: 16px;
        height: 16px;
      }

      .glass-menu-label {
        flex: 1;
        font-size: 14px;
        color: var(--text-primary);
      }

      .glass-menu-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        background: transparent;
        border-radius: 6px;
        color: var(--text-tertiary);
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-menu-btn:hover {
        background: var(--glass-bg-hover);
        color: var(--text-primary);
      }

      .glass-menu-delete:hover {
        background: rgba(239, 68, 68, 0.1);
        color: rgb(239, 68, 68);
      }

      /* Footer */
      .glass-footer-hint {
        font-size: 12px;
        color: var(--text-tertiary);
      }

      .glass-btn-danger {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 10px 16px;
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.3);
        border-radius: 8px;
        color: rgb(239, 68, 68);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
        width: 100%;
      }

      .glass-btn-danger:hover {
        background: rgba(239, 68, 68, 0.2);
        border-color: rgba(239, 68, 68, 0.5);
      }

      .glass-btn-reset {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 10px 16px;
        background: var(--glass-bg-hover);
        border: 1px solid var(--glass-border);
        border-radius: 8px;
        color: var(--text-secondary);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
        width: 100%;
      }

      .glass-btn-reset:hover {
        background: var(--glass-bg-selected);
        border-color: var(--glass-border-strong);
        color: var(--text-primary);
      }

      .glass-settings-footer {
        justify-content: flex-end;
      }

      .glass-settings-footer-actions {
        display: flex;
        gap: 6px;
      }

      .glass-settings-footer-actions .glass-btn {
        height: 32px;
        padding: 0 14px;
        font-size: 12px;
      }

      .glass-btn-cancel {
        padding: 6px 16px;
        background: var(--glass-bg-hover);
        border: 1px solid var(--glass-border);
        border-radius: 8px;
        color: var(--text-secondary);
        font-size: 13px;
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-btn-cancel:hover {
        background: var(--glass-bg-selected);
        color: var(--text-primary);
      }

      .glass-btn-primary {
        padding: 6px 16px;
        background: var(--text-primary);
        border: 1px solid transparent;
        border-radius: 8px;
        color: var(--glass-bg);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-btn-primary:hover {
        opacity: 0.85;
      }

      .glass-btn-add {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 10px 16px;
        background: rgba(59, 130, 246, 0.1);
        border: 1px solid rgba(59, 130, 246, 0.3);
        border-radius: 8px;
        color: rgb(59, 130, 246);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
        width: 100%;
      }

      .glass-btn-add:hover {
        background: rgba(59, 130, 246, 0.2);
        border-color: rgba(59, 130, 246, 0.5);
      }

      /* Screenshot View */
      .glass-screenshot-body {
        display: flex;
        flex-direction: column;
        gap: 12px;
        max-height: 400px;
        overflow-y: auto;
        overscroll-behavior: contain;
      }

      .glass-screenshot-preview {
        padding: 12px;
        display: flex;
        justify-content: center;
        background: var(--glass-bg-hover);
        border-radius: 8px;
      }

      .glass-screenshot-preview img {
        max-width: 100%;
        max-height: 200px;
        border-radius: 6px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      }

      .glass-screenshot-content {
        padding: 0 12px 12px;
      }

      .glass-screenshot-actions {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .glass-screenshot-actions .glass-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        height: 32px;
        padding: 0 10px;
        font-size: 12px;
      }

      .glass-screenshot-result {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .glass-screenshot-result-label,
      .glass-screenshot-generated-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .glass-screenshot-result-text {
        font-size: 14px;
        line-height: 1.6;
        color: var(--text-primary);
        white-space: pre-wrap;
        max-height: 150px;
        overflow-y: auto;
        padding: 12px;
        background: var(--glass-bg-hover);
        border-radius: 8px;
      }

      .glass-screenshot-generated-img {
        max-width: 100%;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      }

      .glass-screenshot-result-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 8px;
      }

      .glass-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 20px;
        color: var(--text-secondary);
      }

      .glass-loading-spinner {
        width: 20px;
        height: 20px;
        border: 2px solid var(--glass-border);
        border-top-color: var(--text-primary);
        border-radius: 50%;
        animation: glass-spin 0.8s linear infinite;
      }

      @keyframes glass-spin {
        to { transform: rotate(360deg); }
      }

      /* Toast */
      .glass-toast {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        padding: 10px 20px;
        background: var(--glass-bg);
        border: 0.5px solid var(--glass-border-strong);
        border-radius: 20px;
        color: var(--text-primary);
        font-size: 13px;
        opacity: 0;
        transition: all var(--duration-fast) var(--ease-out);
        z-index: 10;
      }

      .glass-toast.show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      /* View Transition */
      /* ========================================
         Browse Trail View
         ======================================== */
      .glass-trail-content {
        padding: 8px;
      }

      .glass-trail-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 20px;
        text-align: center;
      }

      .glass-trail-empty-icon {
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-tertiary);
        margin-bottom: 12px;
      }

      .glass-trail-empty-icon svg {
        width: 32px;
        height: 32px;
      }

      .glass-trail-empty-text {
        font-size: 14px;
        font-weight: 500;
        color: var(--text-secondary);
        margin-bottom: 4px;
      }

      .glass-trail-empty-hint {
        font-size: 12px;
        color: var(--text-tertiary);
      }

      .glass-trail-group {
        margin-bottom: 12px;
      }

      .glass-trail-date {
        font-size: 12px;
        font-weight: 600;
        color: var(--text-secondary);
        padding: 4px 12px;
        margin-bottom: 4px;
      }

      .glass-trail-entries {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .glass-trail-entry {
        display: flex;
        align-items: center;
        padding: 10px 12px;
        border-radius: 10px;
        cursor: pointer;
        transition: background var(--duration-fast) var(--ease-out);
      }

      .glass-trail-entry:hover {
        background: var(--glass-bg-hover);
      }

      .glass-trail-entry-info {
        flex: 1;
        min-width: 0;
      }

      .glass-trail-entry-title {
        font-size: 14px;
        font-weight: 500;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: 2px;
      }

      .glass-trail-entry-meta {
        display: flex;
        gap: 8px;
        font-size: 12px;
        color: var(--text-tertiary);
      }

      .glass-trail-entry-domain {
        max-width: 150px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .glass-trail-entry-delete {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border: none;
        background: transparent;
        color: var(--text-tertiary);
        cursor: pointer;
        border-radius: 6px;
        font-size: 16px;
        opacity: 0;
        transition: all var(--duration-fast) var(--ease-out);
        margin-left: 8px;
        flex-shrink: 0;
      }

      .glass-trail-entry:hover .glass-trail-entry-delete {
        opacity: 1;
      }

      .glass-trail-entry-delete:hover {
        color: #ff6b6b;
      }

      .glass-trail-load-more {
        display: flex;
        justify-content: center;
        padding: 12px 0;
      }

      .glass-btn-load-more {
        background: var(--glass-bg-hover);
        border: 0.5px solid var(--glass-border);
        color: var(--text-secondary);
        padding: 6px 16px;
        border-radius: 8px;
        font-size: 12px;
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-btn-load-more:hover {
        background: var(--glass-border);
        color: var(--text-primary);
      }

      .glass-trail-footer-actions {
        display: flex;
        gap: 6px;
      }

      .glass-trail-footer-actions .glass-btn,
      .glass-chat-footer-actions .glass-btn {
        height: 32px;
        padding: 0 12px;
        font-size: 12px;
      }

      /* ========================================
         Context Chat View
         ======================================== */
      .glass-chat-content {
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        contain: layout style;
      }

      .glass-chat-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 20px;
        text-align: center;
      }

      .glass-chat-empty-icon {
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-tertiary);
        margin-bottom: 12px;
      }

      .glass-chat-empty-icon svg {
        width: 32px;
        height: 32px;
      }

      .glass-chat-empty-text {
        font-size: 14px;
        color: var(--text-secondary);
      }

      .glass-chat-msg {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .glass-chat-msg-label {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--text-tertiary);
      }

      .glass-chat-msg-text {
        font-size: 14px;
        line-height: 1.6;
        color: var(--text-primary);
      }

      .glass-chat-msg-text code {
        background: var(--glass-bg-hover);
        padding: 2px 6px;
        border-radius: 4px;
        font-family: "SF Mono", ui-monospace, monospace;
        font-size: 13px;
      }

      .glass-chat-msg-user .glass-chat-msg-text {
        background: var(--glass-bg-selected);
        padding: 10px 14px;
        border-radius: 12px;
        border-top-left-radius: 4px;
      }

      .glass-chat-msg-assistant .glass-chat-msg-text {
        background: var(--glass-bg-hover);
        padding: 10px 14px;
        border-radius: 12px;
        border-top-left-radius: 4px;
      }

      .glass-chat-references {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-bottom: 8px;
      }

      .glass-chat-reference {
        font-size: 12px;
        color: var(--text-secondary);
        background: var(--glass-bg-hover);
        padding: 6px 10px;
        border-radius: 6px;
        border-left: 3px solid var(--glass-border-strong);
        font-style: italic;
      }

      .glass-chat-streaming .glass-chat-msg-text {
        box-shadow: inset 0 0 0 1px var(--glass-border-strong);
      }

      .glass-chat-footer-actions {
        display: flex;
        gap: 6px;
      }

      /* ========================================
         Annotations View
         ======================================== */
      .glass-annotations-filter {
        display: flex;
        gap: 4px;
        padding: 8px 12px;
        border-bottom: 0.5px solid var(--glass-divider);
      }

      .glass-filter-btn {
        padding: 4px 12px;
        border-radius: 16px;
        font-size: 12px;
        font-weight: 500;
        border: none;
        background: transparent;
        color: var(--text-secondary);
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-filter-btn:hover {
        background: var(--glass-bg-hover);
        color: var(--text-primary);
      }

      .glass-filter-btn.active {
        background: var(--glass-bg-selected);
        color: var(--text-primary);
      }

      .glass-annotations-content {
        padding: 8px;
      }

      .glass-annotations-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 20px;
        text-align: center;
      }

      .glass-annotations-empty-icon {
        width: 56px;
        height: 56px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-tertiary);
        margin-bottom: 16px;
        background: var(--glass-bg-hover);
        border-radius: 16px;
      }

      .glass-annotations-empty-icon svg {
        width: 28px;
        height: 28px;
      }

      .glass-annotations-empty-text {
        font-size: 15px;
        font-weight: 500;
        color: var(--text-secondary);
        margin-bottom: 6px;
      }

      .glass-annotations-empty-hint {
        font-size: 13px;
        color: var(--text-tertiary);
        max-width: 260px;
        line-height: 1.4;
      }

      .glass-annotations-group {
        margin-bottom: 12px;
      }

      .glass-annotations-date {
        font-size: 12px;
        font-weight: 600;
        color: var(--text-secondary);
        padding: 6px 12px;
        margin-bottom: 6px;
        position: sticky;
        top: 0;
        background: var(--glass-bg);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        z-index: 1;
      }

      .glass-annotations-entries {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .glass-annotation-entry {
        position: relative;
        display: flex;
        align-items: stretch;
        padding: 12px;
        padding-left: 0;
        border-radius: 12px;
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
        gap: 0;
        background: var(--glass-bg-elevated);
        border: 0.5px solid var(--glass-border);
        overflow: hidden;
      }

      .glass-annotation-entry:hover {
        background: var(--glass-bg-hover);
        border-color: var(--glass-border-strong);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }

      .glass-annotation-color-bar {
        width: 4px;
        border-radius: 2px 0 0 2px;
        flex-shrink: 0;
      }

      .glass-annotation-content {
        flex: 1;
        min-width: 0;
        padding-left: 12px;
      }

      .glass-annotation-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 6px;
      }

      .glass-annotation-time {
        font-size: 11px;
        color: var(--text-tertiary);
      }

      .glass-annotation-text {
        font-size: 14px;
        font-weight: 500;
        color: var(--text-primary);
        line-height: 1.5;
        margin-bottom: 6px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .glass-annotation-note {
        font-size: 12px;
        color: var(--text-secondary);
        font-style: italic;
        margin-bottom: 6px;
        padding-left: 10px;
        border-left: 2px solid var(--glass-border-strong);
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .glass-annotation-ai-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 10px;
        font-weight: 600;
        padding: 3px 8px;
        border-radius: 6px;
        background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(139, 92, 246, 0.15));
        color: #60a5fa;
        margin-bottom: 6px;
      }

      .light .glass-annotation-ai-badge {
        background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1));
        color: #2563eb;
      }

      .glass-annotation-ai-icon {
        display: flex;
        align-items: center;
      }

      .glass-annotation-ai-icon svg {
        width: 10px;
        height: 10px;
      }

      .glass-annotation-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        color: var(--text-tertiary);
      }

      .glass-annotation-page {
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .glass-annotation-delete {
        position: absolute;
        top: 8px;
        right: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border: none;
        background: transparent;
        color: var(--text-tertiary);
        cursor: pointer;
        font-size: 16px;
        font-weight: 300;
        opacity: 0;
        transition: color var(--duration-fast) var(--ease-out), opacity var(--duration-fast) var(--ease-out);
      }

      .glass-annotation-entry:hover .glass-annotation-delete {
        opacity: 0.6;
      }

      .glass-annotation-delete:hover {
        opacity: 1 !important;
        color: #ff6b6b;
      }

      .glass-annotations-footer-info {
        font-size: 12px;
        color: var(--text-tertiary);
      }

      /* ========================================
         Knowledge Base View
         ======================================== */
      .glass-knowledge-filter {
        display: flex;
        gap: 4px;
        padding: 8px 12px;
        border-bottom: 0.5px solid var(--glass-divider);
      }

      .glass-knowledge-content {
        padding: 8px;
      }

      .glass-knowledge-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 20px;
        text-align: center;
      }

      .glass-knowledge-empty-icon {
        width: 56px;
        height: 56px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-tertiary);
        margin-bottom: 16px;
        background: var(--glass-bg-hover);
        border-radius: 16px;
      }

      .glass-knowledge-empty-icon svg {
        width: 28px;
        height: 28px;
      }

      .glass-knowledge-empty-text {
        font-size: 15px;
        font-weight: 500;
        color: var(--text-secondary);
        margin-bottom: 6px;
      }

      .glass-knowledge-empty-hint {
        font-size: 13px;
        color: var(--text-tertiary);
        max-width: 260px;
        line-height: 1.4;
      }

      .glass-knowledge-group {
        margin-bottom: 16px;
      }

      .glass-knowledge-date {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 8px 12px;
        margin-bottom: 8px;
        position: sticky;
        top: 0;
        z-index: 1;
      }

      .glass-knowledge-date::before,
      .glass-knowledge-date::after {
        content: '';
        flex: 1;
        height: 0.5px;
        background: linear-gradient(90deg, transparent, var(--glass-border), transparent);
      }

      .glass-knowledge-date::before {
        margin-right: 12px;
      }

      .glass-knowledge-date::after {
        margin-left: 12px;
      }

      .glass-knowledge-date span {
        font-size: 11px;
        font-weight: 500;
        color: var(--text-tertiary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        padding: 4px 12px;
        background: var(--glass-bg-elevated);
        border: 0.5px solid var(--glass-border);
        border-radius: 20px;
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        white-space: nowrap;
      }

      .glass-knowledge-entries {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .glass-knowledge-entry {
        position: relative;
        padding: 12px;
        border-radius: 12px;
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
        background: var(--glass-bg-elevated);
        border: 0.5px solid var(--glass-border);
      }

      .glass-knowledge-entry:hover {
        background: var(--glass-bg-hover);
        border-color: var(--glass-border-strong);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }

      .glass-knowledge-entry-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 6px;
      }

      .glass-knowledge-entry-type {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        font-weight: 600;
        color: var(--text-secondary);
        text-transform: uppercase;
      }

      .glass-knowledge-entry-type-icon {
        display: flex;
        align-items: center;
      }

      .glass-knowledge-entry-type-icon svg {
        width: 12px;
        height: 12px;
      }

      .glass-knowledge-entry-time {
        font-size: 11px;
        color: var(--text-tertiary);
        margin-right: 24px;
      }

      .glass-knowledge-entry-content {
        font-size: 13px;
        color: var(--text-primary);
        line-height: 1.5;
        margin-bottom: 6px;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .glass-knowledge-entry-note {
        font-size: 12px;
        color: var(--text-secondary);
        font-style: italic;
        margin-bottom: 6px;
        padding-left: 8px;
        border-left: 2px solid var(--glass-border-strong);
      }

      .glass-knowledge-entry-ai {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
      }

      .glass-knowledge-entry-ai-badge {
        font-size: 10px;
        font-weight: 600;
        padding: 3px 8px;
        border-radius: 6px;
        background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(139, 92, 246, 0.15));
        color: #60a5fa;
        flex-shrink: 0;
      }

      .light .glass-knowledge-entry-ai-badge {
        background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1));
        color: #2563eb;
      }

      .glass-knowledge-entry-ai-preview {
        font-size: 11px;
        color: var(--text-secondary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .glass-knowledge-entry-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        color: var(--text-tertiary);
      }

      .glass-knowledge-entry-page {
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .glass-knowledge-entry-delete {
        position: absolute;
        top: 10px;
        right: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border: none;
        background: transparent;
        color: var(--text-tertiary);
        cursor: pointer;
        font-size: 16px;
        font-weight: 300;
        opacity: 0;
        transition: color var(--duration-fast) var(--ease-out), opacity var(--duration-fast) var(--ease-out);
      }

      .glass-knowledge-entry:hover .glass-knowledge-entry-delete {
        opacity: 0.6;
      }

      .glass-knowledge-entry-delete:hover {
        opacity: 1 !important;
        color: #ff6b6b;
      }

      .glass-footer-content {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .glass-knowledge-footer-info {
        font-size: 12px;
        color: var(--text-tertiary);
        flex: 1;
      }

      .glass-btn-export-knowledge {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 0;
        border: 0.5px solid var(--glass-border);
        background: var(--glass-bg-hover);
        border-radius: 8px;
        color: var(--text-secondary);
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-btn-export-knowledge:hover {
        background: var(--glass-bg-selected);
        color: var(--text-primary);
      }

      .glass-btn-export-knowledge svg {
        width: 16px;
        height: 16px;
      }

      /* ========================================
         Color Picker for Settings
         ======================================== */
      .glass-color-picker {
        display: flex;
        gap: 10px;
        padding: 6px 0;
      }

      .glass-color-option {
        width: 32px;
        height: 32px;
        border-radius: 100%;
        border: 1.5px solid var(--glass-border);
        background: var(--color);
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .glass-color-option:hover {
        transform: translateY(-2px);
        border-color: var(--color-border);
      }

      .glass-color-option.active {
        border-color: var(--color-border);
        border-width: 2px;
      }

      .glass-color-option-custom {
        background: conic-gradient(#ef4444 0deg 120deg, #22c55e 120deg 240deg, #3b82f6 240deg 360deg) !important;
        border: none;
        position: relative;
        overflow: hidden;
        box-shadow: inset 0 0 0 7px var(--glass-bg);
      }

      .glass-color-option-custom:hover {
        box-shadow: inset 0 0 0 5px var(--glass-bg);
        transform: translateY(-2px);
      }

      .glass-color-option-custom.active {
        background: var(--color) !important;
        border-color: var(--color-border);
        border-width: 2px;
        box-shadow: none;
      }

      .glass-color-option-custom input[type="color"] {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        opacity: 0;
        cursor: pointer;
        border: none;
        padding: 0;
      }

      /* ========================================
         Unified List View Styles (Annotations & Knowledge)
         ======================================== */
      .glass-list-view-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        border-bottom: 0.5px solid var(--glass-divider);
      }

      .glass-list-view-tabs {
        display: flex;
        gap: 4px;
      }

      .glass-list-view-content {
        padding: 8px;
      }

      .glass-list-view-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 20px;
        text-align: center;
      }

      .glass-list-view-empty-icon {
        width: 56px;
        height: 56px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-tertiary);
        margin-bottom: 16px;
        background: var(--glass-bg-hover);
        border-radius: 16px;
      }

      .glass-list-view-empty-icon svg {
        width: 28px;
        height: 28px;
      }

      .glass-list-view-empty-text {
        font-size: 15px;
        font-weight: 500;
        color: var(--text-secondary);
        margin-bottom: 6px;
      }

      .glass-list-view-empty-hint {
        font-size: 13px;
        color: var(--text-tertiary);
        max-width: 260px;
        line-height: 1.4;
      }

      .glass-list-view-group {
        margin-bottom: 16px;
      }

      .glass-list-view-group:last-child {
        margin-bottom: 0;
      }

      .glass-list-view-date {
        font-size: 12px;
        font-weight: 600;
        color: var(--text-secondary);
        padding: 6px 12px;
        margin-bottom: 6px;
        position: sticky;
        top: 0;
        background: var(--glass-bg);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        z-index: 1;
      }

      .glass-list-view-entries {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .glass-list-view-entry {
        position: relative;
        display: flex;
        align-items: stretch;
        padding: 12px;
        padding-left: 0;
        border-radius: 12px;
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
        background: var(--glass-bg-elevated);
        border: 0.5px solid var(--glass-border);
        overflow: hidden;
      }

      .glass-list-view-entry:hover {
        background: var(--glass-bg-hover);
        border-color: var(--glass-border-strong);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }

      .glass-list-view-entry-color-bar {
        width: 4px;
        border-radius: 2px 0 0 2px;
        flex-shrink: 0;
      }

      .glass-list-view-entry-content {
        flex: 1;
        min-width: 0;
        padding-left: 12px;
      }

      .glass-list-view-entry-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 6px;
      }

      .glass-list-view-entry-type {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        font-weight: 600;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }

      .glass-list-view-entry-type-icon {
        display: flex;
        align-items: center;
      }

      .glass-list-view-entry-type-icon svg {
        width: 12px;
        height: 12px;
      }

      .glass-list-view-entry-time {
        font-size: 11px;
        color: var(--text-tertiary);
      }

      .glass-list-view-entry-text {
        font-size: 14px;
        font-weight: 500;
        color: var(--text-primary);
        line-height: 1.5;
        margin-bottom: 6px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .glass-list-view-entry-note {
        font-size: 12px;
        color: var(--text-secondary);
        font-style: italic;
        margin-bottom: 6px;
        padding-left: 10px;
        border-left: 2px solid var(--glass-border-strong);
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .glass-list-view-entry-ai {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
      }

      .glass-list-view-entry-ai-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 10px;
        font-weight: 600;
        padding: 3px 8px;
        border-radius: 6px;
        background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(139, 92, 246, 0.15));
        color: #60a5fa;
        flex-shrink: 0;
      }

      .light .glass-list-view-entry-ai-badge {
        background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1));
        color: #2563eb;
      }

      .glass-list-view-entry-ai-icon {
        display: flex;
        align-items: center;
      }

      .glass-list-view-entry-ai-icon svg {
        width: 10px;
        height: 10px;
      }

      .glass-list-view-entry-ai-preview {
        font-size: 11px;
        color: var(--text-secondary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .glass-list-view-entry-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        color: var(--text-tertiary);
      }

      .glass-list-view-entry-page {
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .glass-list-view-entry-delete {
        position: absolute;
        top: 8px;
        right: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border: none;
        background: transparent;
        color: var(--text-tertiary);
        cursor: pointer;
        border-radius: 6px;
        font-size: 16px;
        opacity: 0;
        transition: all var(--duration-fast) var(--ease-out);
      }

      .glass-list-view-entry:hover .glass-list-view-entry-delete {
        opacity: 1;
      }

      .glass-list-view-entry-delete:hover {
        color: #ff6b6b;
        background: rgba(255, 107, 107, 0.1);
      }

      .glass-list-view-footer-info {
        font-size: 12px;
        color: var(--text-tertiary);
        flex: 1;
      }
  `;
}
