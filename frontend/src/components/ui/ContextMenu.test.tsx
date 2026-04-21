import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import ContextMenu from './ContextMenu';

const items = [
  { label: 'Edit', onClick: vi.fn() },
  { label: 'Remove', onClick: vi.fn() },
  { label: 'Favourite', onClick: vi.fn() },
];

// Wrapper that provides a real anchorRef so position calculations don't crash
function Wrapper({ isOpen = true, onClose = vi.fn() } = {}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={anchorRef}>Anchor</button>
      <ContextMenu
        items={items}
        isOpen={isOpen}
        onClose={onClose}
        anchorRef={anchorRef}
      />
    </>
  );
}

describe('ContextMenu', () => {
  beforeEach(() => {
    items.forEach((i) => i.onClick.mockClear());
  });

  it('renders menu items when open', () => {
    render(<Wrapper />);
    expect(screen.getByTestId('context-menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Remove' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Favourite' })).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(<Wrapper isOpen={false} />);
    expect(screen.queryByTestId('context-menu')).not.toBeInTheDocument();
  });

  it('assigns correct data-testid to each item', () => {
    render(<Wrapper />);
    expect(screen.getByTestId('context-menu-item-edit')).toBeInTheDocument();
    expect(screen.getByTestId('context-menu-item-remove')).toBeInTheDocument();
    expect(screen.getByTestId('context-menu-item-favourite')).toBeInTheDocument();
  });

  it('calls item onClick and onClose when an item is clicked', async () => {
    const onClose = vi.fn();
    render(<Wrapper onClose={onClose} />);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(items[0].onClick).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Escape key is pressed', async () => {
    const onClose = vi.fn();
    render(<Wrapper onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes when clicking outside the menu', async () => {
    const onClose = vi.fn();
    render(
      <div>
        <Wrapper onClose={onClose} />
        <p data-testid="outside">Outside</p>
      </div>,
    );
    await userEvent.click(screen.getByTestId('outside'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('has role="menu" on the container', () => {
    render(<Wrapper />);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('navigates items with ArrowDown', () => {
    render(<Wrapper />);
    const menu = screen.getByRole('menu');
    const first = screen.getByRole('menuitem', { name: 'Edit' });
    // programmatic focus so document.activeElement is set before the keydown
    first.focus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Remove' })).toHaveFocus();
  });

  it('navigates items with ArrowUp', () => {
    render(<Wrapper />);
    const menu = screen.getByRole('menu');
    const second = screen.getByRole('menuitem', { name: 'Remove' });
    second.focus();
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
  });

  it('wraps ArrowDown from the last item to the first', () => {
    render(<Wrapper />);
    const menu = screen.getByRole('menu');
    screen.getByRole('menuitem', { name: 'Favourite' }).focus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
  });

  it('wraps ArrowUp from the first item to the last', () => {
    render(<Wrapper />);
    const menu = screen.getByRole('menu');
    screen.getByRole('menuitem', { name: 'Edit' }).focus();
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(screen.getByRole('menuitem', { name: 'Favourite' })).toHaveFocus();
  });

  it('focuses the first item on Home key', () => {
    render(<Wrapper />);
    const menu = screen.getByRole('menu');
    screen.getByRole('menuitem', { name: 'Favourite' }).focus();
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
  });

  it('focuses the last item on End key', () => {
    render(<Wrapper />);
    const menu = screen.getByRole('menu');
    screen.getByRole('menuitem', { name: 'Edit' }).focus();
    fireEvent.keyDown(menu, { key: 'End' });
    expect(screen.getByRole('menuitem', { name: 'Favourite' })).toHaveFocus();
  });
});
