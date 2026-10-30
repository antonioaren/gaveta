import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly size?: 'sm' | 'md';
  readonly active?: boolean;
}

export function IconButton({
  icon: Icon,
  label,
  size = 'md',
  active = false,
  className = '',
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={`ui-icon-btn ui-icon-btn--${size}${active ? ' ui-icon-btn--active' : ''}${className.length > 0 ? ` ${className}` : ''}`}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon aria-hidden size={size === 'sm' ? 16 : 18} strokeWidth={2} />
    </button>
  );
}
