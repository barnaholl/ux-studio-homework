import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import Input from '@/components/ui/Input';
import Avatar from '@/components/ui/Avatar';
import Skeleton from '@/components/ui/Skeleton';
import Modal from '@/components/ui/Modal';
import ContextMenu from '@/components/ui/ContextMenu';
import { useToast } from '@/components/ui/Toast';
import { useTheme } from '@/contexts/ThemeContext';
import {
  PlusIcon,
  SunIcon,
  MoonIcon,
  ArrowLeftIcon,
  HeartIcon,
  HeartFilledIcon,
  TrashIcon,
  EditIcon,
  SettingsIcon,
  PhoneIcon,
  MuteIcon,
  UserIcon,
  RefreshIcon,
  MoreIcon,
  SortIcon,
  LogoutIcon,
  MenuIcon,
} from '@/components/ui/Icons';
import ProfileBig from '@/assets/icons/ProfileBig.svg';
import ProfileSmall from '@/assets/icons/ProfileSmall.svg';
import EmptyState from '@/components/contacts/EmptyState';

/* ---------- Shared layout helpers ---------- */

function DSSection({
  title,
  description,
  children,
}: {
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-16 flex flex-col gap-6 lg:flex-row lg:gap-6">
      <div className="w-full shrink-0 lg:w-[195px]">
        <h2 className="mb-8">{title}</h2>
        <div className="typo-body text-[var(--text-primary)]">{description}</div>
      </div>
      <div className="flex flex-col gap-6">{children}</div>
    </section>
  );
}

function Swatch({
  color,
  label,
  border,
}: {
  color: string;
  label: string;
  border?: boolean;
}) {
  return (
    <div
      className="flex size-16 shrink-0 items-center justify-center border border-[var(--color-g50)]"
      style={{ backgroundColor: color, borderStyle: border === false ? 'none' : 'solid' }}
    >
      <span className="typo-body text-center text-white">{label}</span>
    </div>
  );
}

function DashedSwatch() {
  return (
    <div className="flex size-16 shrink-0 items-start p-2">
      <div className="h-full w-full rounded-2xl border border-dashed border-[var(--color-g50)]" />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p className="typo-message text-[var(--text-secondary)] mb-3">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

/* ---------- Grey scale data ---------- */

const GREY_SCALE = [
  { token: 'G100', hex: '#141414', label: '100' },
  { token: 'G90', hex: '#191919', label: '90' },
  { token: 'G80', hex: '#1E1E1E', label: '80' },
  { token: 'G70', hex: '#232323', label: '70' },
  { token: 'G60', hex: '#282828', label: '60' },
  { token: 'G50', hex: '#2D2D2D', label: '50' },
  { token: 'G40', hex: '#323232', label: '40' },
  { token: 'G30', hex: '#373737', label: '30' },
  { token: 'G20', hex: '#3C3C3C', label: '20' },
  { token: 'G10', hex: '#414141', label: '10' },
] as const;

const TEXT_OPACITIES = [
  { label: '100%', bg: '#ffffff' },
  { label: '56%', bg: 'rgba(255,255,255,0.56)' },
  { label: '32%', bg: 'rgba(255,255,255,0.32)' },
] as const;

/* ---------- Page ---------- */

export default function DesignSystemPage() {
  const { theme, toggleTheme } = useTheme();
  const { addToast } = useToast();
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const contextMenuAnchorRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="min-h-screen bg-[var(--surface-page)]">
      <div className="mx-auto max-w-[960px] px-6 py-16">
        {/* Header */}
        <header className="flex items-center justify-between mb-16">
          <div className="flex items-center gap-3">
            <Link to="/contacts">
              <IconButton label="Back to contacts" variant="secondary">
                <ArrowLeftIcon />
              </IconButton>
            </Link>
            <h1>Design System</h1>
          </div>
          <IconButton
            label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            variant="secondary"
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </IconButton>
        </header>

        {/* ===== COLOR SYSTEM ===== */}
        <DSSection
          title="Color system"
          description={
            <>
              <p className="mb-8">
                Because of the complexity of the demo we only detailed the text
                and the UI color.
              </p>
              <p className="mb-8">
                In text:
                <br />
                Text uses an opacity based system so text is placed on each layer
                correctly and visibly.
              </p>
              <p>
                In UI:
                <br />
                Our residential grey works with shades. Each level of shade is
                calculated by the type of element and what it sits on.
              </p>
            </>
          }
        >
          {/* Grey scale */}
          <div className="flex flex-wrap gap-2">
            {GREY_SCALE.map((g) => (
              <Swatch key={g.token} color={g.hex} label={g.label} />
            ))}
          </div>

          {/* Text opacity */}
          <div className="flex flex-wrap gap-2">
            {TEXT_OPACITIES.map((t) => (
              <Swatch key={t.label} color={t.bg} label={t.label} />
            ))}
          </div>

          {/* Foreground - 20 shade */}
          <div className="flex flex-col gap-2">
            <p className="typo-message text-[var(--text-disabled)]">
              Foreground - 20 shade
            </p>
            <div className="flex gap-2">
              <Swatch color="#141414" label="100" />
              <DashedSwatch />
              <Swatch color="#1E1E1E" label="80" />
            </div>
          </div>

          {/* Button - 40 shade */}
          <div className="flex flex-col gap-2">
            <p className="typo-message text-[var(--text-disabled)]">
              Button - 40 shade
            </p>
            <div className="flex gap-2">
              <Swatch color="#141414" label="100" />
              <DashedSwatch />
              <DashedSwatch />
              <DashedSwatch />
              <Swatch color="#282828" label="60" />
            </div>
          </div>

          {/* Button states - 10 shade */}
          <div className="flex flex-col gap-2">
            <p className="typo-message text-[var(--text-disabled)]">
              Button states - 10 shade
            </p>
            <div className="flex gap-2">
              <Swatch color="#282828" label="Default" />
              <Swatch color="#2D2D2D" label="Hover" />
              <Swatch color="#323232" label="Active" />
            </div>
          </div>
        </DSSection>

        {/* ===== TYPE SYSTEM ===== */}
        <DSSection
          title="Type system"
          description={
            <p>
              In this demo we use a font pair of Glysa and Lexend Deca.
            </p>
          }
        >
          {/* H1 */}
          <div className="flex flex-col gap-2">
            <h1>Headline 1. Used for titles</h1>
            <p className="typo-message text-[var(--text-secondary)]">
              Glysa - H1 - Medium - Font size: 32px - Line height: 48px - Letter spacing: 0%
            </p>
          </div>

          {/* H2 */}
          <div className="flex flex-col gap-2">
            <h2>Headline 2. Used for subtitles</h2>
            <p className="typo-message text-[var(--text-secondary)]">
              Glysa - H2 - Medium - Font size: 24px - Line height: 40px - Letter spacing: 0%
            </p>
          </div>

          {/* H3 */}
          <div className="flex flex-col gap-2">
            <h3>Headline 3 Used for highlighting text in simple components</h3>
            <p className="typo-message text-[var(--text-secondary)]">
              Lexend Deca - Regular - Font size: 16px - Line height: 24px - Letter spacing: 1%
            </p>
          </div>

          {/* Body */}
          <div className="flex flex-col gap-2">
            <p className="typo-body text-[var(--text-primary)]">
              Body. Used for interactive elements
            </p>
            <p className="typo-message text-[var(--text-secondary)]">
              Lexend Deca - Body - Regular - Font size: 14px - Line height: 20px - Letter spacing: 1%
            </p>
          </div>

          {/* Message */}
          <div className="flex flex-col gap-2">
            <p className="typo-message text-[var(--text-primary)]">
              Message. Used for displaying extensive info.
            </p>
            <p className="typo-message text-[var(--text-secondary)]">
              Lexend Deca - Body - Regular - Font size: 12px - Line height: 16px - Letter spacing: 1%
            </p>
          </div>
        </DSSection>

        {/* ===== COMPONENTS ===== */}

        {/* Buttons */}
        <section className="mb-16">
          <h2 className="mb-6 pb-3 border-b border-[var(--border-default)]">Buttons</h2>
          <Row label="Primary — md">
            <Button variant="primary">Done</Button>
            <Button variant="primary" loading>Loading</Button>
            <Button variant="primary" disabled>Disabled</Button>
            <Button variant="primary" icon={<PlusIcon width={16} height={16} />}>Add new</Button>
          </Row>
          <Row label="Primary — sm">
            <Button variant="primary" size="sm">Done</Button>
            <Button variant="primary" size="sm" loading>Loading</Button>
            <Button variant="primary" size="sm" disabled>Disabled</Button>
            <Button variant="primary" size="sm" icon={<PlusIcon width={16} height={16} />}>Add picture</Button>
          </Row>
          <Row label="Secondary — md">
            <Button variant="secondary">Cancel</Button>
            <Button variant="secondary" loading>Loading</Button>
            <Button variant="secondary" disabled>Disabled</Button>
            <Button variant="secondary" icon={<RefreshIcon width={16} height={16} />}>Retry</Button>
          </Row>
          <Row label="Secondary — sm">
            <Button variant="secondary" size="sm">Cancel</Button>
            <Button variant="secondary" size="sm" loading>Loading</Button>
            <Button variant="secondary" size="sm" disabled>Disabled</Button>
            <Button variant="secondary" size="sm" icon={<TrashIcon width={16} height={16} />} />
          </Row>
          <Row label="Special">
            <Button variant="special" icon={<PlusIcon width={16} height={16} />}>Add new</Button>
          </Row>
        </section>

        {/* Icons */}
        <section className="mb-16">
          <h2 className="mb-6 pb-3 border-b border-[var(--border-default)]">Icons</h2>
          <div className="flex flex-wrap gap-6">
            {(
              [
                ['Plus', <PlusIcon />],
                ['Settings', <SettingsIcon />],
                ['Sun', <SunIcon />],
                ['Moon', <MoonIcon />],
                ['ArrowLeft', <ArrowLeftIcon />],
                ['Menu', <MenuIcon />],
                ['More', <MoreIcon />],
                ['Heart', <HeartIcon />],
                ['HeartFilled', <HeartFilledIcon />],
                ['Trash', <TrashIcon />],
                ['Edit', <EditIcon />],
                ['Sort', <SortIcon />],
                ['Phone', <PhoneIcon />],
                ['Mute', <MuteIcon />],
                ['User', <UserIcon />],
                ['Refresh', <RefreshIcon />],
                ['Logout', <LogoutIcon />],
              ] as const
            ).map(([label, icon]) => (
              <div key={label as string} className="flex flex-col items-center gap-2">
                <div className="text-[var(--text-primary)]">{icon as React.ReactNode}</div>
                <span className="typo-message text-[var(--text-disabled)]">
                  {label as string}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Inputs */}
        <section className="mb-16">
          <h2 className="mb-6 pb-3 border-b border-[var(--border-default)]">Inputs</h2>
          <div className="flex flex-col gap-4 max-w-[364px]">
            <Input
              label="Default"
              placeholder="Enter text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
            />
            <Input
              label="With error"
              placeholder="Enter email"
              error={inputError || undefined}
              onFocus={() => setInputError('Invalid email address')}
              onBlur={() => setInputError('')}
              defaultValue="not-an-email"
            />
            <Input label="Disabled" placeholder="Disabled" disabled />
          </div>
        </section>

        {/* Avatars */}
        <section className="mb-16">
          <h2 className="mb-6 pb-3 border-b border-[var(--border-default)]">Avatars</h2>
          <Row label="Large (88px)">
            <Avatar src={ProfileBig} name="Profile" size="lg" />
          </Row>
          <Row label="Small (40px)">
            <Avatar src={ProfileSmall} name="Profile" size="sm" />
          </Row>
        </section>

        {/* Skeleton */}
        <section className="mb-16">
          <h2 className="mb-6 pb-3 border-b border-[var(--border-default)]">Skeleton</h2>
          <Row label="Shapes">
            <Skeleton width={40} height={40} rounded="full" />
            <Skeleton width={160} height={14} />
            <Skeleton width={120} height={12} />
            <Skeleton width={80} height={32} rounded="lg" />
          </Row>
          <div className="flex items-center gap-4 h-16">
            <Skeleton width={40} height={40} rounded="full" />
            <div className="flex flex-col gap-2">
              <Skeleton width={160} height={14} />
              <Skeleton width={120} height={12} />
            </div>
          </div>
        </section>

        {/* Toasts */}
        <section className="mb-16">
          <h2 className="mb-6 pb-3 border-b border-[var(--border-default)]">Toasts</h2>
          <Row label="Trigger">
            <Button
              variant="secondary"
              onClick={() => addToast('Contact added', { type: 'success' })}
            >
              Success
            </Button>
            <Button
              variant="secondary"
              onClick={() => addToast('Failed to delete contact', { type: 'error' })}
            >
              Error
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                addToast('John Appleseed removed', {
                  type: 'info',
                  undoAction: () => addToast('Undo triggered', { type: 'success' }),
                })
              }
            >
              Info + Undo
            </Button>
          </Row>
        </section>

        {/* Modal */}
        <section className="mb-16">
          <h2 className="mb-6 pb-3 border-b border-[var(--border-default)]">Modal</h2>
          <p className="typo-body text-[var(--text-secondary)] mb-6">
            Animated overlay dialog. Traps focus, closes on Escape or backdrop click.
            Restores focus to the trigger element on close.
          </p>
          <Row label="Trigger">
            <Button variant="secondary" onClick={() => setModalOpen(true)}>
              Open modal
            </Button>
          </Row>
          <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Edit contact">
            <div className="flex flex-col gap-4 w-full">
              <Input label="Name" placeholder="Full name" defaultValue="John Appleseed" />
              <Input label="Phone" placeholder="+36 00 000 0000" />
              <div className="flex gap-3 justify-end pt-2">
                <Button variant="secondary" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => setModalOpen(false)}>
                  Save
                </Button>
              </div>
            </div>
          </Modal>
        </section>

        {/* Context Menu */}
        <section className="mb-16">
          <h2 className="mb-6 pb-3 border-b border-[var(--border-default)]">Context Menu</h2>
          <p className="typo-body text-[var(--text-secondary)] mb-6">
            Floating action menu anchored to a trigger element. Auto-flips when near viewport
            edges. Closes on outside click or Escape.
          </p>
          <Row label="Trigger">
            <IconButton
              ref={contextMenuAnchorRef}
              label="Open context menu"
              variant="secondary"
              onClick={() => setContextMenuOpen((o) => !o)}
            >
              <MoreIcon />
            </IconButton>
          </Row>
          <ContextMenu
            isOpen={contextMenuOpen}
            onClose={() => setContextMenuOpen(false)}
            anchorRef={contextMenuAnchorRef}
            items={[
              { label: 'Edit', icon: <EditIcon />, onClick: () => addToast('Edit clicked', { type: 'info' }) },
              { label: 'Favourite', icon: <HeartIcon />, onClick: () => addToast('Favourite clicked', { type: 'info' }) },
              { label: 'Delete', icon: <TrashIcon />, onClick: () => addToast('Delete clicked', { type: 'error' }) },
            ]}
          />
        </section>

        {/* Empty State */}
        <section className="mb-16">
          <h2 className="mb-6 pb-3 border-b border-[var(--border-default)]">Empty State</h2>
          <p className="typo-body text-[var(--text-secondary)] mb-6">
            Shown when the contacts list is empty. Includes an illustration and a call-to-action button.
          </p>
          <EmptyState onAddContact={() => addToast('Add contact clicked', { type: 'info' })} />
        </section>


      </div>
    </div>
  );
}
