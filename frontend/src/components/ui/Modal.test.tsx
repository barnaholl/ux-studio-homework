import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal from './Modal';

function renderModal({
  children = <p>Modal content</p>,
  ...rest
}: Partial<Parameters<typeof Modal>[0]> = {}) {
  return render(
    <Modal isOpen={true} onClose={vi.fn()} title="Test Modal" {...rest}>
      {children}
    </Modal>,
  );
}

describe('Modal', () => {
  it('renders title and children when open', () => {
    renderModal();
    expect(screen.getByText('Test Modal')).toBeInTheDocument();
    expect(screen.getByText('Modal content')).toBeInTheDocument();
  });

  it('renders with data-testid="modal"', () => {
    renderModal();
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('does not render content when isOpen is false', () => {
    renderModal({ isOpen: false });
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
    expect(screen.queryByText('Modal content')).not.toBeInTheDocument();
  });

  it('calls onClose when Escape key is pressed', async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    // The backdrop is aria-hidden — query by role="dialog" and click outside it
    const backdrop = document
      .querySelector('[aria-hidden="true"]') as HTMLElement;
    await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('has role="dialog" and aria-modal', () => {
    renderModal();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('has aria-label matching the title prop', () => {
    renderModal({ title: 'Add Contact' });
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Add Contact');
  });

  it('locks body scroll when open', () => {
    renderModal();
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('restores body scroll when closed', () => {
    const { rerender } = renderModal();
    expect(document.body.style.overflow).toBe('hidden');
    rerender(
      <Modal isOpen={false} onClose={vi.fn()} title="Test Modal">
        <p>Modal content</p>
      </Modal>,
    );
    expect(document.body.style.overflow).toBe('');
  });

  it('restores focus to the previously focused element on close', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    const { rerender } = renderModal({ isOpen: true });
    rerender(
      <Modal isOpen={false} onClose={vi.fn()} title="Test Modal">
        <p>Modal content</p>
      </Modal>,
    );

    expect(trigger).toHaveFocus();
    document.body.removeChild(trigger);
  });

  it('traps Tab focus within the dialog', () => {
    renderModal({
      children: (
        <>
          <button>First</button>
          <button>Last</button>
        </>
      ),
    });
    screen.getByRole('button', { name: 'Last' }).focus();
    // Tab from the last focusable element should wrap to the first
    fireEvent.keyDown(window, { key: 'Tab', bubbles: true });
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('traps Shift+Tab focus within the dialog', () => {
    renderModal({
      children: (
        <>
          <button>First</button>
          <button>Last</button>
        </>
      ),
    });
    screen.getByRole('button', { name: 'First' }).focus();
    // Shift+Tab from the first focusable element should wrap to the last
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true, bubbles: true });
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();
  });
});
