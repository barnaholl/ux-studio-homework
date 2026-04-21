import { useState, useRef, useCallback, useId, type ReactNode } from 'react';

interface TooltipProps {
  content: string;
  children: ReactNode;
}

/**
 * Lightweight tooltip that only shows when the child text is truncated.
 * Checks `scrollWidth > clientWidth` on mouse enter / focus.
 */
export default function Tooltip({ content, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const tooltipId = useId();

  const show = useCallback(() => {
    const el = ref.current;
    if (el && el.scrollWidth > el.clientWidth) {
      setVisible(true);
    }
  }, []);

  const hide = useCallback(() => {
    setVisible(false);
  }, []);

  return (
    <div
      ref={ref}
      className="relative min-w-0"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-describedby={visible ? tooltipId : undefined}
    >
      {children}
      {visible && (
        <div
          id={tooltipId}
          role="tooltip"
          className="absolute left-0 bottom-full mb-1.5 z-50 max-w-64 px-2.5 py-1.5 rounded-lg typo-message bg-(--surface-elevated) text-(--text-primary) border border-(--border-default) shadow-lg pointer-events-none whitespace-normal break-words"
        >
          {content}
        </div>
      )}
    </div>
  );
}
