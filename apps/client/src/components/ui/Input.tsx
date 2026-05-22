import { forwardRef, type InputHTMLAttributes } from 'react';
import { clsx } from 'clsx';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-white/70">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={clsx(
          'w-full px-3 py-2 bg-white/5 border rounded-lg text-white text-sm placeholder-white/25',
          'transition-colors focus:outline-none focus:ring-2 focus:ring-accent',
          error ? 'border-red-500/50 focus:border-red-500/50' : 'border-white/10 focus:border-accent-muted',
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      {hint && !error && <p className="text-xs text-white/40">{hint}</p>}
    </div>
  ),
);
Input.displayName = 'Input';
