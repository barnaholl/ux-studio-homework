import { render, screen, fireEvent } from '@testing-library/react';
import Tooltip from './Tooltip';

// Helper: make the container appear truncated so the tooltip shows
function makeTruncated(el: HTMLElement) {
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: 200 });
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: 100 });
}

// Helper: make the container appear NOT truncated (no-op tooltip)
function makeNotTruncated(el: HTMLElement) {
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: 100 });
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: 100 });
}

describe('Tooltip', () => {
  it('does not render tooltip content initially', () => {
    render(
      <Tooltip content="Full name here">
        <p>Short</p>
      </Tooltip>,
    );
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows tooltip on mouseenter when content is truncated', () => {
    const { container } = render(
      <Tooltip content="Full name here">
        <p>Short</p>
      </Tooltip>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    makeTruncated(wrapper);
    fireEvent.mouseEnter(wrapper);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Full name here');
  });

  it('does not show tooltip on mouseenter when text is NOT truncated', () => {
    const { container } = render(
      <Tooltip content="Full name here">
        <p>Short</p>
      </Tooltip>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    makeNotTruncated(wrapper);
    fireEvent.mouseEnter(wrapper);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('hides tooltip on mouseleave', () => {
    const { container } = render(
      <Tooltip content="Full name here">
        <p>Short</p>
      </Tooltip>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    makeTruncated(wrapper);
    fireEvent.mouseEnter(wrapper);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.mouseLeave(wrapper);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows tooltip on focus when content is truncated (keyboard accessibility)', () => {
    const { container } = render(
      <Tooltip content="Full name here">
        <p>Short</p>
      </Tooltip>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    makeTruncated(wrapper);
    fireEvent.focus(wrapper);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('hides tooltip on blur', () => {
    const { container } = render(
      <Tooltip content="Full name here">
        <p>Short</p>
      </Tooltip>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    makeTruncated(wrapper);
    fireEvent.focus(wrapper);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.blur(wrapper);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('sets aria-describedby on the wrapper when tooltip is visible', () => {
    const { container } = render(
      <Tooltip content="Full name here">
        <p>Short</p>
      </Tooltip>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    makeTruncated(wrapper);
    fireEvent.mouseEnter(wrapper);
    const tooltip = screen.getByRole('tooltip');
    expect(wrapper).toHaveAttribute('aria-describedby', tooltip.id);
  });

  it('removes aria-describedby when tooltip is hidden', () => {
    const { container } = render(
      <Tooltip content="Full name here">
        <p>Short</p>
      </Tooltip>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    makeTruncated(wrapper);
    fireEvent.mouseEnter(wrapper);
    fireEvent.mouseLeave(wrapper);
    expect(wrapper).not.toHaveAttribute('aria-describedby');
  });
});
