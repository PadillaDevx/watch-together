import { clsx } from 'clsx';

const sizes = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-11 w-11 text-base',
  xl: 'h-14 w-14 text-lg',
};

interface AvatarProps {
  username: string;
  avatar?: string | null;
  size?: keyof typeof sizes;
  className?: string;
}

const COLORS = [
  'bg-violet-600', 'bg-indigo-600', 'bg-blue-600', 'bg-cyan-600',
  'bg-teal-600', 'bg-emerald-600', 'bg-fuchsia-600', 'bg-pink-600',
];

function colorFor(username: string) {
  let sum = 0;
  for (let i = 0; i < username.length; i++) sum += username.charCodeAt(i);
  return COLORS[sum % COLORS.length];
}

export function Avatar({ username, avatar, size = 'md', className }: AvatarProps) {
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={username}
        className={clsx('rounded-full object-cover flex-shrink-0', sizes[size], className)}
      />
    );
  }
  return (
    <div
      className={clsx(
        'rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0',
        colorFor(username), sizes[size], className,
      )}
    >
      {username[0]?.toUpperCase()}
    </div>
  );
}
