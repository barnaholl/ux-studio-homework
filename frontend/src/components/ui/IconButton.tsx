import { type ButtonHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

type IconButtonVariant = 'primary' | 'secondary';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
  size?: 'sm' | 'md';
  label: string;
}

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    { variant = 'secondary', size = 'md', label, className, children, ...props },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        data-variant={variant}
        aria-label={label}
        className={clsx(
          'inline-flex items-center justify-center',
          size === 'md' && 'h-11 w-11',
          size === 'sm' && 'h-8 w-8',
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);

IconButton.displayName = 'IconButton';
export default IconButton;
