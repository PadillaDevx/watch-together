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
