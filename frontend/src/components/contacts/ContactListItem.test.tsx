import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ContactListItem from './ContactListItem';
import type { Contact } from '@/types/contact';

const baseContact: Contact = {
  id: 'c1',
  name: 'Alice Smith',
  phone: '+1 555 0100',
  email: 'alice@example.com',
  avatarUrl: null,
  isFavourite: false,
  createdAt: '2026-01-01T00:00:00Z',
};

function renderItem(
  overrides: Partial<Contact> = {},
  handlers: {
    onEdit?: () => void;
    onDelete?: () => void;
    onToggleFavourite?: () => void;
  } = {},
) {
  const contact = { ...baseContact, ...overrides };
  return render(
    <ContactListItem
      contact={contact}
      onEdit={handlers.onEdit ?? vi.fn()}
      onDelete={handlers.onDelete ?? vi.fn()}
      onToggleFavourite={handlers.onToggleFavourite ?? vi.fn()}
    />,
  );
}

describe('ContactListItem', () => {
  it('renders the contact name', () => {
    renderItem();
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  it('renders phone as the subtitle when name is present', () => {
    renderItem();
    expect(screen.getByText('+1 555 0100')).toBeInTheDocument();
  });

  it('falls back to email when name is null', () => {
    renderItem({ name: null });
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('falls back to phone when both name and email are null', () => {
    renderItem({ name: null, email: null });
    expect(screen.getAllByText('+1 555 0100').length).toBeGreaterThan(0);
  });

  it('shows "No name" when all fields are null', () => {
    renderItem({ name: null, phone: null, email: null });
    expect(screen.getAllByText('No name').length).toBeGreaterThan(0);
  });

  it('calls onEdit when Enter key is pressed', () => {
    const onEdit = vi.fn();
    renderItem({}, { onEdit });
    const item = screen.getByTestId('contact-list-item');
    fireEvent.keyDown(item, { key: 'Enter' });
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('calls onDelete when Delete key is pressed', () => {
    const onDelete = vi.fn();
    renderItem({}, { onDelete });
    const item = screen.getByTestId('contact-list-item');
    fireEvent.keyDown(item, { key: 'Delete' });
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('calls onDelete when Backspace key is pressed', () => {
    const onDelete = vi.fn();
    renderItem({}, { onDelete });
    const item = screen.getByTestId('contact-list-item');
    fireEvent.keyDown(item, { key: 'Backspace' });
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('opens the context menu when the "More actions" button is clicked', async () => {
    renderItem();
    await userEvent.click(screen.getByTestId('contact-more-btn'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('calls onEdit via the context menu Edit item', async () => {
    const onEdit = vi.fn();
    renderItem({}, { onEdit });
    await userEvent.click(screen.getByTestId('contact-more-btn'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('calls onDelete via the context menu Remove item', async () => {
    const onDelete = vi.fn();
    renderItem({}, { onDelete });
    await userEvent.click(screen.getByTestId('contact-more-btn'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove' }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('calls onToggleFavourite via the context menu Favourite item', async () => {
    const onToggleFavourite = vi.fn();
    renderItem({}, { onToggleFavourite });
    await userEvent.click(screen.getByTestId('contact-more-btn'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Favourite' }));
    expect(onToggleFavourite).toHaveBeenCalledOnce();
  });

  it('shows "Unfavourite" in the menu when the contact is already a favourite', async () => {
    renderItem({ isFavourite: true });
    await userEvent.click(screen.getByTestId('contact-more-btn'));
    expect(screen.getByRole('menuitem', { name: 'Unfavourite' })).toBeInTheDocument();
  });

  it('has data-contact-id attribute set to the contact id', () => {
    renderItem();
    expect(screen.getByTestId('contact-list-item')).toHaveAttribute(
      'data-contact-id',
      'c1',
    );
  });
});
