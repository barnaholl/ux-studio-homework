import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from './Toast';

// Helper component that exposes addToast to tests
function ToastTrigger({
  message,
  type = 'info',
  withUndo = false,
  duration,
}: {
  message: string;
  type?: 'success' | 'error' | 'info';
  withUndo?: boolean;
  duration?: number;
}) {
  const { addToast } = useToast();
  return (
    <button
      onClick={() =>
        addToast(message, {
          type,
          undoAction: withUndo ? vi.fn() : undefined,
          duration,
        })
      }
    >
      Show toast
    </button>
  );
}

function setup(props: Parameters<typeof ToastTrigger>[0]) {
  return render(
    <ToastProvider>
      <ToastTrigger {...props} />
    </ToastProvider>,
  );
}

describe('Toast / ToastProvider', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a toast message when addToast is called', async () => {
    setup({ message: 'Contact saved' });
    await userEvent.click(screen.getByRole('button', { name: 'Show toast' }));
    expect(screen.getByTestId('toast')).toBeInTheDocument();
    expect(screen.getByText('Contact saved')).toBeInTheDocument();
  });

  it('renders with role="alert" for screen readers', async () => {
    setup({ message: 'Done' });
    await userEvent.click(screen.getByRole('button', { name: 'Show toast' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('shows undo button when undoAction is provided', async () => {
    setup({ message: 'Deleted', withUndo: true });
    await userEvent.click(screen.getByRole('button', { name: 'Show toast' }));
    expect(screen.getByTestId('toast-undo-btn')).toBeInTheDocument();
  });

  it('does not show undo button when no undoAction', async () => {
    setup({ message: 'Saved' });
    await userEvent.click(screen.getByRole('button', { name: 'Show toast' }));
    expect(screen.queryByTestId('toast-undo-btn')).not.toBeInTheDocument();
  });

  it('removes toast when dismiss button is clicked', async () => {
    setup({ message: 'Dismissible' });
    await userEvent.click(screen.getByRole('button', { name: 'Show toast' }));
    expect(screen.getByTestId('toast')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('toast-dismiss-btn'));
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
  });

  it('calls undoAction and removes toast when undo is clicked', async () => {
    const onUndo = vi.fn();
    function UndoTrigger() {
      const { addToast } = useToast();
      return (
        <button onClick={() => addToast('Removed', { undoAction: onUndo })}>
          Trigger
        </button>
      );
    }
    render(
      <ToastProvider>
        <UndoTrigger />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Trigger' }));
    await userEvent.click(screen.getByTestId('toast-undo-btn'));

    expect(onUndo).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
  });

  it('throws when useToast is used outside ToastProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Bad() {
      useToast();
      return null;
    }
    expect(() => render(<Bad />)).toThrow('useToast must be used within ToastProvider');
    spy.mockRestore();
  });

  it('auto-dismisses toast after the given duration', async () => {
    vi.useFakeTimers();
    setup({ message: 'Auto-dismiss', duration: 1000 });

    // fireEvent is synchronous and avoids timer-deadlock issues with userEvent
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Show toast' }));
    });
    expect(screen.getByTestId('toast')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
  });
});
