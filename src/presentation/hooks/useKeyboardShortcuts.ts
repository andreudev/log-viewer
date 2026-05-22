import { useEffect } from 'react';

interface KeyboardShortcutsProps {
  focusedIndex: number | null;
  setFocusedIndex: (updater: number | null | ((prev: number | null) => number | null)) => void;
  maxIndex: number;
  onSelectRow: (index: number) => void;
  onPinRow: (index: number) => void;
  onCompareRow: (index: number) => void;
  onSearchFocus: () => void;
  onCloseAll: () => void;
  isDrawerOpen: boolean;
  isCompareModalOpen: boolean;
  isShortcutsModalOpen: boolean;
}

export function useKeyboardShortcuts({
  focusedIndex,
  setFocusedIndex,
  maxIndex,
  onSelectRow,
  onPinRow,
  onCompareRow,
  onSearchFocus,
  onCloseAll,
  isDrawerOpen,
  isCompareModalOpen,
  isShortcutsModalOpen
}: KeyboardShortcutsProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Ignore if in input, textarea, select or contenteditable
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT' ||
          activeEl.getAttribute('contenteditable') === 'true')
      ) {
        // If pressing escape inside an input, blur it
        if (e.key === 'Escape') {
          (activeEl as HTMLElement).blur();
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
        case 'j':
        case 'J':
          e.preventDefault();
          setFocusedIndex((prev: number | null) => {
            if (prev === null) return 0;
            if (prev >= maxIndex - 1) return maxIndex - 1;
            return prev + 1;
          });
          break;

        case 'ArrowUp':
        case 'k':
        case 'K':
          e.preventDefault();
          setFocusedIndex((prev: number | null) => {
            if (prev === null) return 0;
            if (prev <= 0) return 0;
            return prev - 1;
          });
          break;

        case 'Enter':
        case 'o':
        case 'O':
          if (focusedIndex !== null) {
            e.preventDefault();
            onSelectRow(focusedIndex);
          }
          break;

        case 'p':
        case 'P':
          if (focusedIndex !== null) {
            e.preventDefault();
            onPinRow(focusedIndex);
          }
          break;

        case 'c':
        case 'C':
          if (focusedIndex !== null) {
            e.preventDefault();
            onCompareRow(focusedIndex);
          }
          break;

        case '/':
          e.preventDefault();
          onSearchFocus();
          break;

        case 'Escape':
          if (isDrawerOpen || isCompareModalOpen || isShortcutsModalOpen) {
            e.preventDefault();
            onCloseAll();
          }
          break;

        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [focusedIndex, maxIndex, onSelectRow, onPinRow, onCompareRow, onSearchFocus, onCloseAll, isDrawerOpen, isCompareModalOpen, isShortcutsModalOpen, setFocusedIndex]);
}
