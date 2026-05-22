export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

export function getApiError(err: unknown, fallback = 'Error desconocido'): string {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;
}

// Per-user text colors that mirror Avatar's bg-* scheme so chat overlays match avatars
const USER_TEXT_COLORS = [
  'text-violet-400', 'text-indigo-400', 'text-blue-400', 'text-cyan-400',
  'text-teal-400', 'text-emerald-400', 'text-fuchsia-400', 'text-pink-400',
];

export function textColorFor(username: string): string {
  let sum = 0;
  for (let i = 0; i < username.length; i++) sum += username.charCodeAt(i);
  return USER_TEXT_COLORS[sum % USER_TEXT_COLORS.length] ?? 'text-violet-400';
}
