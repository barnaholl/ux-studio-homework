import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ContactForm from './ContactForm';

function renderForm(props: Partial<Parameters<typeof ContactForm>[0]> = {}) {
  const defaults = {
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    ...props,
  };
  return { ...render(<ContactForm {...defaults} />), ...defaults };
}

describe('ContactForm', () => {
  it('renders name, phone and email inputs', () => {
    renderForm();
    expect(screen.getByTestId('contact-name-input')).toBeInTheDocument();
    expect(screen.getByTestId('contact-phone-input')).toBeInTheDocument();
    expect(screen.getByTestId('contact-email-input')).toBeInTheDocument();
  });

  it('submit button is disabled when all fields are empty', () => {
    renderForm();
    expect(screen.getByTestId('contact-form-submit')).toBeDisabled();
  });

  it('submit button enables once name is filled', async () => {
    renderForm();
    await userEvent.type(screen.getByTestId('contact-name-input'), 'Alice');
    expect(screen.getByTestId('contact-form-submit')).toBeEnabled();
  });

  it('calls onSubmit with form values when submitted', async () => {
    const onSubmit = vi.fn();
    renderForm({ onSubmit });

    await userEvent.type(screen.getByTestId('contact-name-input'), 'Alice');
    await userEvent.type(screen.getByTestId('contact-phone-input'), '+1 555 0100');
    await userEvent.click(screen.getByTestId('contact-form-submit'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledOnce();
      // The form always includes all fields; email defaults to ''
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Alice', phone: '+1 555 0100' }),
      );
    });
  });

  it('calls onCancel when cancel button is clicked', async () => {
    const onCancel = vi.fn();
    renderForm({ onCancel });
    await userEvent.click(screen.getByTestId('contact-form-cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('shows an email validation error for invalid email', async () => {
    renderForm();
    // Fill name so the submit button is enabled
    await userEvent.type(screen.getByTestId('contact-name-input'), 'Alice');
    await userEvent.type(screen.getByTestId('contact-email-input'), 'not-an-email');
    // fireEvent.submit bypasses jsdom's native email constraint validation so
    // React Hook Form + Zod can handle the validation and render the error message
    fireEvent.submit(screen.getByTestId('contact-form'));
    await waitFor(() => {
      expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
    });
  });

  it('pre-fills fields from defaultValues', () => {
    renderForm({
      defaultValues: { name: 'Bob', phone: '+44 20 1234 5678', email: 'bob@example.com' },
    });
    expect(screen.getByTestId('contact-name-input')).toHaveValue('Bob');
    expect(screen.getByTestId('contact-phone-input')).toHaveValue('+44 20 1234 5678');
    expect(screen.getByTestId('contact-email-input')).toHaveValue('bob@example.com');
  });

  it('submit button is disabled on pristine edit form (isDirty = false)', () => {
    renderForm({
      defaultValues: { name: 'Alice' },
    });
    // Form has a value but isDirty is false — submit should be disabled
    expect(screen.getByTestId('contact-form-submit')).toBeDisabled();
  });

  it('enables submit when editing an existing contact and changing a field', async () => {
    renderForm({ defaultValues: { name: 'Alice' } });
    await userEvent.clear(screen.getByTestId('contact-name-input'));
    await userEvent.type(screen.getByTestId('contact-name-input'), 'Alice Updated');
    expect(screen.getByTestId('contact-form-submit')).toBeEnabled();
  });

  it('calls onFileSelect when an image file is selected', async () => {
    const onFileSelect = vi.fn();
    renderForm({ onFileSelect });

    const file = new File(['data'], 'avatar.png', { type: 'image/png' });
    const input = screen.getByTestId('avatar-file-input');
    await userEvent.upload(input, file);

    expect(onFileSelect).toHaveBeenCalledWith(file);
  });

  it('rejects non-image file and shows an error', async () => {
    renderForm();
    const file = new File(['data'], 'doc.pdf', { type: 'application/pdf' });
    const input = screen.getByTestId('avatar-file-input');
    // fireEvent bypasses the accept attribute so the onChange handler runs
    // and can apply its own type validation
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText(/only jpeg, png, webp and gif/i)).toBeInTheDocument();
  });

  it('rejects images over 5 MB and shows an error', () => {
    renderForm();
    const bigFile = new File([new ArrayBuffer(6 * 1024 * 1024)], 'big.png', {
      type: 'image/png',
    });
    Object.defineProperty(bigFile, 'size', { value: 6 * 1024 * 1024 });
    const input = screen.getByTestId('avatar-file-input');
    fireEvent.change(input, { target: { files: [bigFile] } });
    expect(screen.getByText(/under 5 mb/i)).toBeInTheDocument();
  });

  it('shows avatar preview and remove button when existingAvatar is provided', () => {
    renderForm({ existingAvatar: 'https://example.com/avatar.jpg' });
    expect(screen.getByTestId('avatar-remove-btn')).toBeInTheDocument();
  });

  it('calls onFileRemove and hides remove button when avatar is removed', async () => {
    const onFileRemove = vi.fn();
    renderForm({
      existingAvatar: 'https://example.com/avatar.jpg',
      onFileRemove,
    });
    await userEvent.click(screen.getByTestId('avatar-remove-btn'));
    expect(onFileRemove).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('avatar-remove-btn')).not.toBeInTheDocument();
  });

  it('passes avatarFile as second argument to onSubmit when avatar is selected', async () => {
    const onSubmit = vi.fn();
    const onFileSelect = vi.fn();
    renderForm({ onSubmit, onFileSelect });

    const file = new File(['data'], 'avatar.png', { type: 'image/png' });
    fireEvent.change(screen.getByTestId('avatar-file-input'), {
      target: { files: [file] },
    });
    await userEvent.type(screen.getByTestId('contact-name-input'), 'Alice');
    await userEvent.click(screen.getByTestId('contact-form-submit'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Alice' }),
        file,
      );
    });
  });

  it('shows loading state on submit button when isSubmitting is true', async () => {
    renderForm({ defaultValues: { name: 'Alice' }, isSubmitting: true });
    // Even on a pristine form, isSubmitting should render the loading spinner
    // (button is disabled either way; we check the Loading sr-only text)
    expect(screen.getByText('Loading')).toBeInTheDocument();
  });
});
