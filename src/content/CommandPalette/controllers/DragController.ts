// Drag Controller - handles panel dragging functionality

export interface DragState {
  isDragging: boolean;
  dragStartX: number;
  dragStartY: number;
  panelStartX: number;
  panelStartY: number;
  savedPanelPosition: { top: string; left: string; right: string; transform: string } | null;
}

export function createDragState(): DragState {
  return {
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    panelStartX: 0,
    panelStartY: 0,
    savedPanelPosition: null,
  };
}

export function createDragHandlers(
  shadowRoot: ShadowRoot | null,
  state: DragState
): {
  handleDragStart: (e: MouseEvent) => void;
  handleDragMove: (e: MouseEvent) => void;
  handleDragEnd: () => void;
} {
  const handleDragStart = (e: MouseEvent): void => {
    if (!shadowRoot) return;
    const panel = shadowRoot.querySelector('.glass-panel') as HTMLElement;
    if (!panel) return;

    // Only start drag if clicking on draggable area (not buttons/inputs)
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'BUTTON' ||
      target.tagName === 'INPUT' ||
      target.tagName === 'SELECT' ||
      target.closest('button') ||
      target.closest('input') ||
      target.closest('select')
    ) {
      return;
    }

    e.preventDefault();
    state.isDragging = true;
    state.dragStartX = e.clientX;
    state.dragStartY = e.clientY;

    const rect = panel.getBoundingClientRect();
    state.panelStartX = rect.left;
    state.panelStartY = rect.top;

    // Save initial position if not saved
    if (!state.savedPanelPosition) {
      state.savedPanelPosition = {
        top: panel.style.top,
        left: panel.style.left,
        right: panel.style.right,
        transform: panel.style.transform,
      };
    }

    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
  };

  const handleDragMove = (e: MouseEvent): void => {
    if (!state.isDragging || !shadowRoot) return;

    const panel = shadowRoot.querySelector('.glass-panel') as HTMLElement;
    if (!panel) return;

    const deltaX = e.clientX - state.dragStartX;
    const deltaY = e.clientY - state.dragStartY;

    const newX = state.panelStartX + deltaX;
    const newY = state.panelStartY + deltaY;

    // Constrain to viewport
    const maxX = window.innerWidth - panel.offsetWidth;
    const maxY = window.innerHeight - panel.offsetHeight;

    panel.style.left = `${Math.max(0, Math.min(newX, maxX))}px`;
    panel.style.top = `${Math.max(0, Math.min(newY, maxY))}px`;
    panel.style.right = 'auto';
    panel.style.transform = 'none';
  };

  const handleDragEnd = (): void => {
    state.isDragging = false;
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', handleDragEnd);
  };

  return { handleDragStart, handleDragMove, handleDragEnd };
}

export function restorePanelPosition(
  shadowRoot: ShadowRoot | null,
  state: DragState
): void {
  if (!shadowRoot || !state.savedPanelPosition) return;

  const panel = shadowRoot.querySelector('.glass-panel') as HTMLElement;
  if (!panel) return;

  panel.style.top = state.savedPanelPosition.top;
  panel.style.left = state.savedPanelPosition.left;
  panel.style.right = state.savedPanelPosition.right;
  panel.style.transform = state.savedPanelPosition.transform;
}
