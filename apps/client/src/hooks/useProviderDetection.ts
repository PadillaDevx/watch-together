import { type RefObject } from 'react';

export type SyncMode = 'smart' | 'passive';

const cache = new Map<string, SyncMode>();

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export async function detectProviderCapabilities(
  iframeRef: RefObject<HTMLIFrameElement>,
  embedUrl: string,
): Promise<SyncMode> {
  const domain = getDomain(embedUrl);
  if (cache.has(domain)) return cache.get(domain)!;

  const result = await new Promise<SyncMode>((resolve) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve('passive');
    }, 2000);

    const handler = (e: MessageEvent) => {
      if (e.source === iframeRef.current?.contentWindow) {
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        resolve('smart');
      }
    };

    window.addEventListener('message', handler);
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'ping', source: 'watchjunto' },
      '*',
    );
  });

  cache.set(domain, result);
  return result;
}
