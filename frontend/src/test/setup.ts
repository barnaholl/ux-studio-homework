import '@testing-library/jest-dom';
import { vi } from 'vitest';
import React from 'react';

// ── framer-motion mock ───────────────────────────────────────────────────────
// jsdom does not support CSS animations or the Web Animations API.
// We replace motion.* components with plain HTML elements and AnimatePresence
// with a transparent wrapper so component tests are not blocked by animation
// timing or missing API errors.
vi.mock('framer-motion', () => {
  const ANIM_PROPS = new Set([
    'initial', 'animate', 'exit', 'transition', 'variants',
    'whileTap', 'whileHover', 'whileFocus', 'whileDrag',
    'whileInView', 'layout', 'layoutId', 'drag', 'dragConstraints',
    'onDragStart', 'onDragEnd', 'onAnimationStart', 'onAnimationComplete',
  ]);

  const makeMotionComponent = (tag: string) =>
    React.forwardRef(({ children, ...props }: Record<string, unknown>, ref) => {
      const cleaned: Record<string, unknown> = {};
      for (const key of Object.keys(props)) {
        if (!ANIM_PROPS.has(key)) cleaned[key] = props[key];
      }
      return React.createElement(tag, { ...cleaned, ref }, children as React.ReactNode);
    });

  const motion = new Proxy({} as Record<string, ReturnType<typeof makeMotionComponent>>, {
    get: (_target, prop: string) => makeMotionComponent(prop),
  });

  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    useAnimation: () => ({ start: vi.fn(), stop: vi.fn() }),
    useInView: () => false,
  };
});

// ── URL.createObjectURL / revokeObjectURL ────────────────────────────────────
// jsdom does not implement these — stub them for avatar upload tests.
Object.defineProperty(global.URL, 'createObjectURL', {
  value: vi.fn(() => 'blob:mock-url'),
  writable: true,
});
Object.defineProperty(global.URL, 'revokeObjectURL', {
  value: vi.fn(),
  writable: true,
});

// ── window.matchMedia ────────────────────────────────────────────────────────
// Not available in jsdom — needed by some hooks/contexts.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
