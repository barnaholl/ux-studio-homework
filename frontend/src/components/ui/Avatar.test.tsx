import { render, screen, fireEvent } from '@testing-library/react';
import Avatar from './Avatar';

describe('Avatar', () => {
  it('renders an img with alt text equal to the name prop', () => {
    render(<Avatar name="Alice" />);
    expect(screen.getByRole('img', { name: 'Alice' })).toBeInTheDocument();
  });

  it('uses the placeholder when no src is provided', () => {
    render(<Avatar name="Alice" />);
    // The mocked SVG import resolves to a string; just confirm src is not empty
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src');
    expect(img.getAttribute('src')).not.toBe('');
  });

  it('uses the provided src directly', () => {
    render(<Avatar name="Alice" src="https://example.com/alice" size="sm" />);
    // For a plain URL without an image extension, the sm size should append -40.webp
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://example.com/alice-40.webp',
    );
  });

  it('appends -120.webp suffix for lg size', () => {
    render(<Avatar name="Alice" src="https://example.com/alice" size="lg" />);
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://example.com/alice-120.webp',
    );
  });

  it('does not append a suffix to blob: URLs', () => {
    render(<Avatar name="Alice" src="blob:mock-url" />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:mock-url');
  });

  it('does not append a suffix to data: URLs', () => {
    render(<Avatar name="Alice" src="data:image/png;base64,abc" />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'data:image/png;base64,abc');
  });

  it('does not append a suffix to URLs that already have an image extension', () => {
    render(<Avatar name="Alice" src="https://cdn.example.com/avatar.webp" />);
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://cdn.example.com/avatar.webp',
    );
  });

  it('falls back to the placeholder when the image fails to load', () => {
    render(<Avatar name="Alice" src="https://example.com/alice" size="sm" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://example.com/alice-40.webp');

    // Simulate a broken image
    fireEvent.error(img);

    // src should now point to the placeholder (mocked SVG import)
    expect(img.getAttribute('src')).not.toContain('alice');
  });

  it('resets the error state when src changes', () => {
    const { rerender } = render(
      <Avatar name="Alice" src="https://example.com/bad" size="sm" />,
    );
    fireEvent.error(screen.getByRole('img'));

    rerender(<Avatar name="Alice" src="https://example.com/good" size="sm" />);

    // After a new src, the img should attempt the new URL (error reset)
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://example.com/good-40.webp',
    );
  });
});
