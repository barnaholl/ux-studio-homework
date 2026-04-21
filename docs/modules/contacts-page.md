# Contacts Page

**File**: `frontend/src/pages/ContactsPage.tsx`

The main application screen. Renders the contact list with search, sort, favourites filter, infinite scroll, keyboard navigation, and modals.

---

## Layout

Three-column responsive grid based on the Figma spec:

```
Left sidebar (7fr) | Contact list (16fr) | Right panel (7fr)
```

Vertical rhythm uses `10.667svh` row units. On mobile the layout collapses to a single column with a floating action button (FAB) for adding contacts.

---

## Search

- Controlled `<input>` bound to `searchInput` state.
- **Debounced 300 ms**: a `useEffect` + `useRef` timer pattern updates the `filters.search` value used by `useContacts` only after the user pauses typing.
- Clears debounce timer on cleanup (prevents stale updates after unmount).

---

## Sort

A `ContextMenu`-based dropdown triggered by the "Sort" button. Options:

| `sortBy` value | Label |
|---|---|
| `date-desc` | Newest first (default) |
| `date-asc` | Oldest first |
| `name-asc` | A → Z |
| `name-desc` | Z → A |

Selection updates `filters.sortBy`, closing the menu and re-querying.

---

## Favourites filter

A toggle button that sets `filters.favouritesOnly`. When active, `useContacts` passes `favouritesOnly=true` to the API, which returns only starred contacts.

---

## Infinite scroll

An `IntersectionObserver` watches a sentinel `<div>` at the bottom of the list. When the sentinel enters the viewport:

```ts
if (hasNextPage && !isFetchingNextPage) {
  fetchNextPage();
}
```

The observer is recreated whenever `hasNextPage` changes.

---

## Keyboard navigation

Contacts can be navigated without a mouse:

| Key | Action |
|---|---|
| `ArrowDown` | Move focus to next contact |
| `ArrowUp` | Move focus to previous contact |
| `Enter` | Open edit modal for focused contact |

Focus index is tracked in `focusedIdx` state. `ContactListItem` receives `tabIndex={focusedIdx === index ? 0 : -1}` to make only the focused row reachable via Tab.

---

## Modals managed here

| Modal | Trigger | State |
|---|---|---|
| `AddContactModal` | "Add" button / FAB | `addOpen` |
| `EditContactModal` | Row click / Enter / context menu "Edit" | `editContact` (contact object or `null`) |
| `ProfileModal` | Header avatar | `profileOpen` |

---

## Context menu on rows

Each `ContactListItem` exposes a "⋯" button. `ContactsPage` manages the context menu state (`contextMenu: { contact, anchor }`) and renders a single shared `ContextMenu` instance, positioning it next to the clicked row.

Context menu items: **Edit**, **Favourite / Unfavourite**, **Mute / Unmute**, **Delete**.

---

## Delete flow

See [contacts-flows.md](contacts-flows.md#delete-flow).

---

## `data-testid` attributes

| Selector | Element |
|---|---|
| `[data-testid="contacts-main"]` | Root layout container |
| `[data-testid="contacts-search-input"]` | Search `<input>` |
| `[data-testid="favourites-filter-btn"]` | Favourites toggle button |
| `[data-testid="sort-trigger-btn"]` | Sort dropdown trigger button |
| `[data-testid="contacts-list"]` | Scrollable list container |
| `[data-testid="add-contact-btn"]` | Desktop "Add contact" button |
| `[data-testid="add-contact-fab"]` | Mobile floating action button |
