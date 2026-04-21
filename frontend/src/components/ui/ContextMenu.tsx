import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export default function ContextMenu({
  items,
  isOpen,
  onClose,
  anchorRef,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!isOpen || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const menuWidth = 219;
    const menuHeight = items.length * 44;

    let top = rect.bottom + 4;
    let left = rect.right - menuWidth;

    // Clamp to viewport bounds
    if (left < 8) left = 8;
    if (left + menuWidth > window.innerWidth - 8) {
      left = window.innerWidth - menuWidth - 8;
    }
    if (top + menuHeight > window.innerHeight - 8) {
      top = rect.top - menuHeight - 4;
    }

    setPosition({ top, left });
  }, [isOpen, anchorRef, items.length]);

  useEffect(() => {
    if (!isOpen) return;
    const handle = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        !(anchorRef.current && anchorRef.current.contains(e.target as Node))
      ) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        anchorRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, onClose, anchorRef]);

  // Focus first item when menu opens
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        itemRefs.current[0]?.focus();
      });
    }
  }, [isOpen]);

  const handleMenuKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const focusedIdx = itemRefs.current.findIndex(
        (el) => el === document.activeElement,
      );
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = (focusedIdx + 1) % items.length;
        itemRefs.current[next]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = (focusedIdx - 1 + items.length) % items.length;
        itemRefs.current[prev]?.focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        itemRefs.current[0]?.focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        itemRefs.current[items.length - 1]?.focus();
      }
    },
    [items.length],
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={menuRef}
          data-testid="context-menu"
          className="fixed z-40 w-54.75 overflow-hidden rounded-lg bg-(--surface-elevated) shadow-xl"
          style={{ top: position.top, left: position.left }}
          initial={{ opacity: 0, scale: 0.95, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -4 }}
          transition={{ duration: 0.15 }}
          role="menu"
          onKeyDown={handleMenuKeyDown}
        >
          {items.map((item, i) => (
            <button
              key={item.label}
              ref={(el) => { itemRefs.current[i] = el; }}
              role="menuitem"
              data-testid={`context-menu-item-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              tabIndex={-1}
              onClick={() => {
                item.onClick();
                onClose();
              }}
              className="flex w-full items-center gap-3 px-2.5 py-3 typo-body text-(--text-primary) transition-colors"
            >
              {item.icon && (
                <span className="shrink-0 text-(--text-secondary)">{item.icon}</span>
              )}
              {item.label}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
