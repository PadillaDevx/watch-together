import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'disabled:opacity-50 disabled:cursor-not-allowed select-none',
        variant === 'primary' && 'bg-accent hover:bg-accent-light active:bg-accent-dark text-white shadow-lg shadow-accent',
        variant === 'secondary' && 'bg-white/8 hover:bg-white/12 text-white border border-white/10',
        variant === 'ghost' && 'text-white/60 hover:text-white hover:bg-white/8',
        variant === 'danger' && 'bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/20',
        size === 'xs' && 'px-2.5 py-1 text-xs',
        size === 'sm' && 'px-3 py-1.5 text-sm',
        size === 'md' && 'px-4 py-2 text-sm',
        size === 'lg' && 'px-5 py-2.5 text-base',
        className,
      )}
      {...props}
    >
      {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Cargando...</> : children}
    </button>
  ),
);
Button.displayName = 'Button';
