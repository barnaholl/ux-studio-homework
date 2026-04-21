# Design System

UI primitives living in `frontend/src/components/ui/`. All components are written in TypeScript with Tailwind v4 CSS custom-property tokens.

---

## CSS Design Tokens

Defined as CSS custom properties and consumed via Tailwind's `(--token-name)` syntax:

| Token | Usage |
|---|---|
| `--surface-page` | Page background |
| `--surface-card` | Card / modal surface |
| `--surface-hover` | Hover highlight |
| `--border-default` | Default border colour |
| `--text-primary` | Primary text |
| `--text-secondary` | Secondary / muted text |
| `--text-tertiary` | Placeholder / disabled text |
| `--btn-primary` | Primary button fill |
| `--btn-primary-hover` | Primary button hover fill |
| `--color-error` | Error text & borders |
| `--color-warning` | Warning accents |
| `--color-success` | Success accents |
| `--color-muted` | Muted / disabled |

---

## Button

**File**: `components/ui/Button.tsx`

### Props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `variant` | `'primary' \| 'secondary' \| 'special'` | `'primary'` | Sets `data-variant` attribute for CSS selection |
| `size` | `'sm' \| 'md'` | `'md'` | Controls padding / font size |
| `loading` | `boolean` | `false` | Disables button; shows spinner icon |
| `...rest` | `ButtonHTMLAttributes` | — | Spread onto `<button>` (callers set `data-testid` here) |

Renders a `<button>` with `data-variant={variant}` so callers can target it with `[data-variant="primary"]` selectors or `data-testid` in tests.

---

## Input

**File**: `components/ui/Input.tsx`

Extends `InputHTMLAttributes<HTMLInputElement>`.

| Prop | Notes |
|---|---|
| `label` | Renders a `<label>` wired to the `<input>` via `id` |
| `error` | Renders an error message below; sets `aria-invalid="true"` and `aria-describedby` on input |
| `...props` | Spread onto `<input>` — callers pass `data-testid` directly this way |

---

## Avatar

**File**: `components/ui/Avatar.tsx`

| Prop | Type | Notes |
|---|---|---|
| `src` | `string \| null \| undefined` | Raw avatar URL |
| `name` | `string` | Used as `alt` text |
| `size` | `'sm' \| 'lg'` | `sm` = 40 px, `lg` = 88 px |

**`resolvedSrc` logic**: appends `?f=webp` to the URL when the `src` does not already include a query string, for automatic WebP transcoding via the avatar pipeline.  
**Error fallback**: an `onError` handler sets `imgError = true`, which renders the placeholder SVG instead of a broken image.

---

## Skeleton

**File**: `components/ui/Skeleton.tsx`

Renders `<div>` elements with `animate-pulse` and `aria-hidden="true"`. Used as loading placeholders for contact list rows and profile details. No `data-testid` needed (display-only, hidden from assistive tech).

---

## IconButton

**File**: `components/ui/IconButton.tsx`

Wraps a `<button>` with an SVG icon slot. Props:

| Prop | Notes |
|---|---|
| `label` | Becomes `aria-label` |
| `data-variant` | Optional style variant |
| `...props` | Spread onto `<button>` — callers pass `data-testid` directly |

---

## Modal

**File**: `components/ui/Modal.tsx`

Animated dialog overlay using Framer Motion `AnimatePresence`.

### Features
- **Focus trap**: on open, focuses the first focusable element inside the dialog; restores focus to the previously focused element on close.
- **Escape to close**: `keydown` listener calls `onClose` on `Escape`.
- **Scroll lock**: adds `overflow-hidden` to `<body>` while open; removes it on cleanup.
- **Animation**: backdrop fades in (`opacity: 0→1`); dialog slides up (`y: 20→0`) with spring physics.

### Props

| Prop | Notes |
|---|---|
| `isOpen` | Drives `AnimatePresence` |
| `onClose` | Called on backdrop click or Escape |
| `title` | Rendered in `<h2>` inside dialog |
| `children` | Modal body |

The inner `motion.div[role="dialog"]` carries `data-testid="modal"`. The component does **not** spread arbitrary props, so callers cannot inject additional testids via the `Modal` component itself.

---

## Toast

**File**: `components/ui/Toast.tsx`

### Context API

```ts
const { addToast } = useToast();

addToast({
  message: 'Contact deleted',
  type: 'success' | 'error' | 'info',
  undoAction?: () => void,   // shows Undo button if provided
  duration?: number,          // ms before auto-dismiss (default 4000)
});
```

### Behaviour
- Toasts are stacked in a fixed region at the bottom-right of the viewport.
- Each toast auto-dismisses after `duration` ms using `setTimeout`; the timer is stored in a `ref` and cleared on manual dismiss or undo.
- Undo calls `undoAction()` then dismisses.
- `AnimatePresence` animates toasts in (`x: 40→0, opacity: 0→1`) and out (`x: 40, opacity: 0`).

### `data-testid` attributes

| Selector | Element |
|---|---|
| `[data-testid="toast-region"]` | Container `div` (fixed region) |
| `[data-testid="toast"]` | Individual toast `motion.div` |
| `[data-testid="toast-undo-btn"]` | Undo button (present when `undoAction` provided) |
| `[data-testid="toast-dismiss-btn"]` | × dismiss button |

---

## ContextMenu

**File**: `components/ui/ContextMenu.tsx`

A positioned dropdown menu triggered by a reference element, with full keyboard navigation.

### Props

| Prop | Notes |
|---|---|
| `items` | `{ label: string; icon?: ReactNode; onClick: () => void; danger?: boolean }[]` |
| `anchorRef` | `RefObject<HTMLElement>` — positions the menu relative to this element |
| `isOpen` | Visibility toggle |
| `onClose` | Called on Escape or outside click |

### Keyboard navigation

| Key | Action |
|---|---|
| `ArrowDown` | Move focus to next item |
| `ArrowUp` | Move focus to previous item |
| `Home` | Move focus to first item |
| `End` | Move focus to last item |
| `Escape` | Close menu |

### `data-testid` attributes

| Selector | Element |
|---|---|
| `[data-testid="context-menu"]` | Container div |
| `[data-testid="context-menu-item-{label}"]` | Each item button — `label` is lowercased and spaces replaced with `-` (e.g. `"context-menu-item-edit"`, `"context-menu-item-remove"`) |

---

## ErrorBoundary

**File**: `components/ui/ErrorBoundary.tsx`

React class component mounted at the app root. Catches render-phase errors via `componentDidCatch`.

On error, renders a centred retry UI with:
- A human-friendly error heading
- The error message (from `error.message`)
- A "Try again" button that calls `window.location.reload()`

### `data-testid` attributes

| Selector | Element |
|---|---|
| `[data-testid="error-boundary"]` | Error fallback container |
| `[data-testid="error-boundary-retry-btn"]` | "Try again" button |
