# Auth: Pages, Context & API Client

Covers the full authentication surface: the `AuthPage` component, `AuthContext`, and the Axios-based API client with token refresh.

---

## AuthPage

**File**: `frontend/src/pages/AuthPage.tsx`

Single-page component that toggles between **Login** and **Register** modes.

### Form libraries
- **React Hook Form v7** — `useForm` for field registration, submission, and error state.
- **Zod v4** — Schema validation via `zodResolver`.

### Schemas

**Login schema**
```ts
{ email: z.string().email(), password: z.string().min(1) }
```

**Register schema**
```ts
{
  displayName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  confirmPassword: z.string(),
}.refine(({ password, confirmPassword }) => password === confirmPassword)
```

### Mode toggle
`mode` state (`'login' | 'register'`) drives which form is rendered. Switching modes resets the form. Framer Motion `AnimatePresence` + `motion.div` animates the transition between forms.

### Error banner
API errors from `AuthContext.login` / `AuthContext.register` are caught and stored in `apiError` state, rendered as a red banner above the submit button.

### `data-testid` attributes

| Selector | Element |
|---|---|
| `[data-testid="auth-card"]` | Outer card container |
| `[data-testid="login-form"]` | Login `<form>` |
| `[data-testid="login-submit"]` | Login submit button |
| `[data-testid="register-form"]` | Register `<form>` |
| `[data-testid="register-submit"]` | Register submit button |
| `[data-testid="auth-mode-toggle"]` | Link/button that switches between login and register |

---

## AuthContext

**File**: `frontend/src/contexts/AuthContext.tsx`

React context providing global auth state and actions.

### State

| Field | Type | Notes |
|---|---|---|
| `user` | `User \| null` | Currently authenticated user (or `null`) |
| `isLoading` | `boolean` | `true` during initial auth check |

### Hydration strategy
On mount, the context **decodes the stored JWT client-side** (without verifying the signature) to hydrate `user` immediately — avoiding a loading flash on page reload. In the background, it calls `GET /users/me` to validate the token is still accepted by the server; on 401 it attempts a token refresh before logging out.

### Actions

| Function | Behaviour |
|---|---|
| `login(email, password)` | `POST /auth/login` → stores tokens → sets `user` |
| `register(data)` | `POST /auth/register` → stores tokens → sets `user` |
| `logout()` | `POST /auth/logout` → clears tokens → sets `user = null` |
| `refreshUser()` | `GET /users/me` → updates `user` in place (used after profile edits) |

Tokens (access + refresh) are stored in `localStorage`. The access token is a short-lived JWT; the refresh token is longer-lived and is rotated on each `/auth/refresh` call.

---

## API Client (`api.ts`)

**File**: `frontend/src/lib/api.ts`

An Axios instance pre-configured for all API calls.

### Base configuration
- `baseURL` — set from `import.meta.env.VITE_API_URL`
- `withCredentials: true`

### Request interceptor
Reads the access token from `localStorage` and injects `Authorization: Bearer <token>` on every outgoing request.

### Response interceptor — 401 → Refresh → Retry

When a response returns **401**:
1. A single `POST /auth/refresh` is fired with the stored refresh token.
2. To prevent thundering-herd under concurrent requests, a module-level `refreshPromise` deduplicates simultaneous refresh attempts — all 401'd requests wait on the same promise.
3. On success: new tokens are stored; the original request is retried with the new access token.
4. On failure: `localStorage` is cleared; the browser is redirected to `/login`.

### Dev logging
In `development` mode, a request interceptor logs each outgoing request's method and URL to `console.debug`.

---

## ThemeContext

**File**: `frontend/src/contexts/ThemeContext.tsx`

Provides `theme` (`'light' | 'dark'`) and `toggleTheme`. Persists to `localStorage`. Applies the chosen theme class to `document.documentElement` so Tailwind's dark-mode CSS custom properties take effect.
