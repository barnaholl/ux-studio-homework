import { render, screen } from '@testing-library/react';
import Input from './Input';

describe('Input', () => {
  it('renders with a visible label', () => {
    render(<Input label="Full Name" />);
    expect(screen.getByText('Full Name')).toBeInTheDocument();
  });

  it('associates the label with the input via htmlFor/id', () => {
    render(<Input label="Email" />);
    // getByLabelText succeeds only when label.htmlFor matches input.id
    expect(screen.getByLabelText('Email').tagName).toBe('INPUT');
  });

  it('uses an externally supplied id over the auto-generated one', () => {
    render(<Input label="Name" id="custom-name" />);
    expect(screen.getByLabelText('Name')).toHaveAttribute('id', 'custom-name');
  });

  it('shows the error message when the error prop is set', () => {
    render(<Input label="Email" error="Invalid email" />);
    expect(screen.getByText('Invalid email')).toBeInTheDocument();
  });

  it('does not render an error message without an error prop', () => {
    render(<Input label="Name" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sets aria-invalid="true" when an error is present', () => {
    render(<Input label="Email" error="Required" />);
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('sets aria-invalid="false" when no error is present', () => {
    render(<Input label="Name" />);
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'false');
  });

  it('wires aria-describedby to the error element id', () => {
    render(<Input label="Email" error="Required" />);
    const input = screen.getByLabelText('Email');
    const errorEl = screen.getByRole('alert');
    expect(input).toHaveAttribute('aria-describedby', errorEl.id);
  });

  it('does not set aria-describedby when there is no error', () => {
    render(<Input label="Name" />);
    expect(screen.getByLabelText('Name')).not.toHaveAttribute('aria-describedby');
  });

  it('passes through extra HTML attributes to the underlying input', () => {
    render(<Input label="Search" placeholder="Type here" type="search" />);
    const input = screen.getByLabelText('Search');
    expect(input).toHaveAttribute('placeholder', 'Type here');
    expect(input).toHaveAttribute('type', 'search');
  });
});
