import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import {
  useContacts,
  useDeleteContact,
  useRestoreContact,
  useToggleFavourite,
} from '@/hooks/useContacts';
import type { ContactsQueryParams } from '@/hooks/useContacts';
import { useToast } from '@/components/ui/Toast';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import type { Contact } from '@/types/contact';
import ContactListItem from '@/components/contacts/ContactListItem';
import AddContactModal from '@/components/contacts/AddContactModal';
import EditContactModal from '@/components/contacts/EditContactModal';
import ProfileModal from '@/components/profile/ProfileModal';
import EmptyState from '@/components/contacts/EmptyState';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import ContextMenu from '@/components/ui/ContextMenu';
import Skeleton from '@/components/ui/Skeleton';
import Avatar from '@/components/ui/Avatar';
import {
  PlusIcon,
  ArrowLeftIcon,
  SettingsIcon,
  SunIcon,
  MoonIcon,
  LogoutIcon,
  UserIcon,
  MenuIcon,
  RefreshIcon,
  SortIcon,
  HeartIcon,
} from '@/components/ui/Icons';

export default function ContactsPage() {
  const deleteContact = useDeleteContact();
  const restoreContact = useRestoreContact();
  const toggleFavourite = useToggleFavourite();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortKey, setSortKey] = useState<'date-asc' | 'date-desc' | 'name-asc' | 'name-desc'>('date-asc');
  const [sortOpen, setSortOpen] = useState(false);
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Debounce search — 300ms
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  // Build server query params
  const queryParams: ContactsQueryParams = {
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    sort: sortKey.startsWith('date') ? 'createdAt' : 'name',
    order: sortKey.endsWith('-desc') ? 'desc' : 'asc',
    favourites: favouritesOnly,
  };

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useContacts(queryParams);
  const contacts = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) fetchNextPage();
      },
      { rootMargin: '200px' },
    );
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Clamp focused index when contact list length changes (delete, search, etc.)
  useEffect(() => {
    if (contacts.length > 0) {
      setFocusedIdx((prev) => Math.min(prev, contacts.length - 1));
    }
  }, [contacts.length]);

  const handleEdit = useCallback((contact: Contact) => {
    setEditContact(contact);
  }, []);

  const handleDelete = useCallback(
    (contact: Contact) => {
      deleteContact.mutate(contact.id, {
        onSuccess: () => {
          addToast(`${contact.name ?? 'Contact'} removed`, {
            type: 'info',
            duration: 5000,
            undoAction: () => {
              restoreContact.mutate(contact.id, {
                onError: () => {
                  addToast('Failed to undo delete', { type: 'error' });
                },
                onSettled: () => {
                  queryClient.invalidateQueries({ queryKey: ['contacts'] });
                },
              });
            },
          });
        },
        onError: () => {
          addToast('Failed to delete contact', { type: 'error' });
        },
      });
    },
    [deleteContact, restoreContact, addToast, queryClient],
  );

  const handleToggleFavourite = useCallback(
    (contact: Contact) => {
      toggleFavourite.mutate(
        { id: contact.id, isFavourite: contact.isFavourite },
        {
          onError: () => {
            addToast('Failed to update favourite', { type: 'error' });
          },
        },
      );
    },
    [toggleFavourite, addToast],
  );

  return (
    <div className="min-h-screen bg-(--surface-page)">
      {/*
        3-column responsive grid (desktop lg+):
          Figma spec at 1440×900:
            cols  → 336 : 768 : 336  =  7fr : 16fr : 7fr
            rows  → 96  : 96  : rest =  10.667svh : 10.667svh : 1fr
          Uses fr/svh so ratios hold at any viewport size.
          Capped at 1440px max-width, centered.
          Below lg → single-column flow, sidebars hidden.
      */}
      <div
        className="
          lg:min-h-screen
          lg:grid
          lg:grid-cols-[7fr_16fr_7fr]
          lg:grid-rows-[10.667svh_10.667svh_1fr]
        "
      >
        {/* ── Row 1 · Decorative top band (desktop only) ────────────── */}
        <div className="hidden lg:block border-b border-r border-(--border-default)" />
        <div className="hidden lg:block border-b border-(--border-default)" />
        <div className="hidden lg:block border-b border-l border-(--border-default)" />

        {/* ── Row 2 Left · Back arrow (desktop only) ────────────────── */}
        <div className="hidden lg:flex items-center justify-end pr-6 border-b border-r border-(--border-default)">
          <IconButton label="Back" variant="secondary" size="sm" className="lg:h-10 lg:w-10" onClick={logout}>
            <ArrowLeftIcon width={24} height={24} />
          </IconButton>
        </div>

        {/* ── Row 2 Center · Page header ────────────────────────────── */}
        <header
          className="
            flex items-center justify-between gap-4
            h-16 lg:h-auto
            px-4 lg:px-6
            border-b border-(--border-default)
          "
        >
          <h1>Contacts</h1>
          <div className="flex items-center gap-2">
            {/* Desktop: Settings + Avatar grouped, then Add new (per Figma) */}
            <div className="hidden lg:flex items-center gap-2">
              <IconButton
                label="Settings"
                variant="secondary"
                size="sm"
                className="lg:h-10 lg:w-10"
                onClick={() => {}}
              >
                <SettingsIcon width={24} height={24} />
              </IconButton>
              <button
                type="button"
                data-testid="profile-btn"
                className="flex items-center justify-center w-10 h-10 rounded-full overflow-hidden cursor-pointer"
                aria-label="Edit profile"
                onClick={() => setProfileModalOpen(true)}
              >
                {user?.avatarUrl ? (
                  <Avatar src={user.avatarUrl} name={user.displayName} size="sm" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-(--surface-input) flex items-center justify-center">
                    <UserIcon width={24} height={24} />
                  </div>
                )}
              </button>
            </div>
            <motion.div whileTap={{ scale: 0.95 }} className="hidden lg:inline-flex ml-4">
              <Button
                variant="special"
                data-testid="add-contact-btn"
                icon={<PlusIcon width={16} height={16} />}
                onClick={() => setAddModalOpen(true)}
              >
                Add new
              </Button>
            </motion.div>
            {/* Mobile: hamburger menu */}
            <IconButton
              ref={menuBtnRef}
              label="Menu"
              data-testid="mobile-menu-btn"
              variant="secondary"
              className="lg:hidden"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <MenuIcon />
            </IconButton>
          </div>

          <ContextMenu
            isOpen={menuOpen}
            onClose={() => setMenuOpen(false)}
            anchorRef={menuBtnRef}
            items={[
              {
                label: 'Edit profile',
                icon: <UserIcon width={20} height={20} />,
                onClick: () => setProfileModalOpen(true),
              },
              {
                label: theme === 'dark' ? 'Light mode' : 'Dark mode',
                icon: theme === 'dark'
                  ? <SunIcon width={20} height={20} />
                  : <MoonIcon width={20} height={20} />,
                onClick: toggleTheme,
              },
              {
                label: 'Log out',
                icon: <LogoutIcon width={20} height={20} />,
                onClick: logout,
              },
            ]}
          />
        </header>

        {/* ── Row 2 Right · Theme toggle (desktop only) ────────────── */}
        <div className="hidden lg:flex items-center justify-start pl-6 border-b border-l border-(--border-default)">
          <IconButton
            label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            data-testid="theme-toggle-btn"
            variant="secondary"
            size="sm"
            className="lg:h-10 lg:w-10"
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <SunIcon width={24} height={24} /> : <MoonIcon width={24} height={24} />}
          </IconButton>
        </div>

        {/* ── Row 3 Left · Empty sidebar (desktop only) ─────────────── */}
        <div className="hidden lg:block border-r border-(--border-default)" />

        {/* ── Row 3 Center · Contact list ───────────────────────────── */}
        <main className="px-4 lg:px-6 pt-6 lg:pt-3 pb-8" aria-busy={isLoading} aria-label="Contacts" data-testid="contacts-main">
          {/* Search + sort + filter toolbar */}
          <div className="flex items-center gap-2 mb-4">
            <input
              type="search"
              aria-label="Search contacts"
              data-testid="contacts-search-input"
              placeholder="Search…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="
                flex-1 h-9 px-3
                rounded-lg border border-(--border-default)
                bg-(--surface-input) text-(--text-primary)
                typo-message placeholder:text-(--text-disabled)
                focus:outline-none focus:ring-2 focus:ring-(--btn-primary)
              "
            />

            {/* Favourites toggle */}
            <button
              type="button"
              aria-label={favouritesOnly ? 'Show all contacts' : 'Show favourites only'}
              aria-pressed={favouritesOnly}
              data-testid="favourites-filter-btn"
              onClick={() => setFavouritesOnly((v) => !v)}
              className={`
                flex items-center justify-center
                w-11 h-11 lg:w-9 lg:h-9 rounded-lg
                border border-(--border-default)
                ${favouritesOnly ? 'bg-(--btn-primary) text-white' : 'bg-(--surface-input) text-(--text-primary)'}
                hover:bg-(--btn-secondary-hover)
                focus:outline-none focus:ring-2 focus:ring-(--btn-primary)
              `}
            >
              <HeartIcon width={16} height={16} />
            </button>

            {/* Sort dropdown */}
            <div className="relative">
              <button
                type="button"
                id="sort-trigger"
                aria-label="Sort contacts"
                aria-expanded={sortOpen}
                aria-haspopup="menu"
                data-testid="sort-trigger-btn"
                onClick={() => setSortOpen((o) => !o)}
                className="
                  flex items-center justify-center
                  w-11 h-11 lg:w-9 lg:h-9 rounded-lg
                  border border-(--border-default)
                  bg-(--surface-input) text-(--text-primary)
                  hover:bg-(--btn-secondary-hover)
                  focus:outline-none focus:ring-2 focus:ring-(--btn-primary)
                  relative
                "
              >
                <SortIcon width={16} height={16} />
                {sortKey !== 'date-asc' && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-(--btn-primary)" />
                )}
              </button>

              {sortOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setSortOpen(false)}
                  />
                  <ul
                    role="menu"
                    aria-labelledby="sort-trigger"
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.stopPropagation();
                        setSortOpen(false);
                        (document.getElementById('sort-trigger') as HTMLElement)?.focus();
                      } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        const next = (e.currentTarget.querySelector('[role="menuitem"]:focus') as HTMLElement)
                          ?.closest('li')?.nextElementSibling?.querySelector('[role="menuitem"]') as HTMLElement | null;
                        next?.focus();
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        const prev = (e.currentTarget.querySelector('[role="menuitem"]:focus') as HTMLElement)
                          ?.closest('li')?.previousElementSibling?.querySelector('[role="menuitem"]') as HTMLElement | null;
                        prev?.focus();
                      }
                    }}
                    className="
                      absolute right-0 top-full mt-1 z-20
                      w-36 py-1
                      rounded-lg border border-(--border-default)
                      bg-(--surface-elevated) shadow-lg
                    "
                  >
                    {([
                      { key: 'date-asc', label: 'Date oldest' },
                      { key: 'date-desc', label: 'Date newest' },
                      { key: 'name-asc', label: 'Name A → Z' },
                      { key: 'name-desc', label: 'Name Z → A' },
                    ] as const).map(({ key, label }) => (
                      <li key={key} role="none">
                        <button
                          role="menuitem"
                          data-testid={`sort-option-${key}`}
                          tabIndex={-1}
                          type="button"
                          onClick={() => { setSortKey(key); setSortOpen(false); }}
                          className="
                            w-full text-left px-3 py-1.5
                            typo-message text-(--text-primary)
                            flex items-center justify-between
                          "
                        >
                          {label}
                          {sortKey === key && (
                            <span className="w-1.5 h-1.5 rounded-full bg-(--btn-primary) shrink-0" />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
          {/* Screen-reader result count announcement */}
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {!isLoading && debouncedSearch
              ? `${contacts.length} contact${contacts.length === 1 ? '' : 's'} found`
              : ''}
          </p>
          {isLoading ? (
            <div className="flex flex-col gap-0">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center h-16 gap-4">
                  <Skeleton width={40} height={40} rounded="full" />
                  <div className="flex flex-col gap-2">
                    <Skeleton width={160} height={14} />
                    <Skeleton width={120} height={12} />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <p className="typo-body text-(--text-secondary)">
                Failed to load contacts
              </p>
              <Button
                variant="secondary"
                icon={<RefreshIcon width={16} height={16} />}
                onClick={() => refetch()}
              >
                Retry
              </Button>
            </div>
          ) : (contacts ?? []).length === 0 && !debouncedSearch && !favouritesOnly ? (
            <EmptyState onAddContact={() => setAddModalOpen(true)} />
          ) : (contacts ?? []).length === 0 ? (
            <p className="typo-body text-(--text-secondary) py-12 text-center">
              {favouritesOnly && !debouncedSearch
                ? 'No favourite contacts yet'
                : `No contacts match "${debouncedSearch}"`}
            </p>
          ) : (
            <div
              className="flex flex-col"
              role="list"
              data-testid="contacts-list"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  const next = Math.min(focusedIdx + 1, contacts.length - 1);
                  setFocusedIdx(next);
                  itemRefs.current[next]?.focus();
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  const prev = Math.max(focusedIdx - 1, 0);
                  setFocusedIdx(prev);
                  itemRefs.current[prev]?.focus();
                }
              }}
            >
              <AnimatePresence mode="popLayout">
                {(contacts ?? []).map((contact, i) => (
                  <ContactListItem
                    key={contact.id}
                    ref={(el) => { itemRefs.current[i] = el; }}
                    contact={contact}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onToggleFavourite={handleToggleFavourite}
                    tabIndex={i === focusedIdx ? 0 : -1}
                    onFocus={() => setFocusedIdx(i)}
                  />
                ))}
              </AnimatePresence>
              <div ref={sentinelRef} aria-hidden="true" />
              {isFetchingNextPage && (
                <div className="flex items-center justify-center h-16 gap-4">
                  <Skeleton width={40} height={40} rounded="full" />
                  <div className="flex flex-col gap-2">
                    <Skeleton width={160} height={14} />
                    <Skeleton width={120} height={12} />
                  </div>
                </div>
              )}
            </div>
          )}        </main>

        {/* ── Row 3 Right · Empty sidebar (desktop only) ────────────── */}
        <div className="hidden lg:block border-l border-(--border-default)" />
      </div>

      {/* Mobile FAB */}
      <motion.button
        type="button"
        aria-label="Add new contact"
        data-testid="add-contact-fab"
        whileTap={{ scale: 0.9 }}
        onClick={() => setAddModalOpen(true)}
        className="
          fixed bottom-6 left-1/2 -translate-x-1/2 z-30
          lg:hidden
          flex items-center justify-center
          w-14 h-14 rounded-full
          bg-(--btn-primary) text-white light:text-black
          shadow-lg
          focus:outline-none focus-visible:ring-2 focus-visible:ring-(--btn-primary) focus-visible:ring-offset-2
        "
      >
        <PlusIcon width={24} height={24} />
      </motion.button>

      {/* Modals */}
      <AddContactModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
      />
      <EditContactModal
        isOpen={!!editContact}
        onClose={() => setEditContact(null)}
        contact={editContact}
      />
      <ProfileModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
      />
    </div>
  );
}
