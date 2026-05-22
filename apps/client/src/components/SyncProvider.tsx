import { useRef, useEffect, useState } from 'react';
import { detectProviderCapabilities, type SyncMode } from '../hooks/useProviderDetection';
import { useSmartSync } from '../hooks/useSmartSync';
import { usePassiveSync } from '../hooks/usePassiveSync';
import { LoadingOverlay } from './LoadingOverlay';
import { PlayInstruction } from './PlayInstruction';
import { ResyncButton } from './ResyncButton';
import { HostBadge } from './HostBadge';
import { socket } from '../lib/socket';

function isMobileDevice(): boolean {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}
function isIOSDevice(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

interface SyncProviderProps {
  embedUrl: string;
  roomId: string;
  userId: string;
  isHost: boolean;
  /**
   * Current host username broadcast via `host-changed` events. Rendered as a
   * discrete pill visible to every participant. Pass `null` when unknown.
   */
  hostUsername?: string | null;
}

export function SyncProvider({ embedUrl, roomId, userId, isHost, hostUsername = null }: SyncProviderProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [syncMode, setSyncMode] = useState<SyncMode>('passive');
  const [detected, setDetected] = useState(false);
  const [smartSpinner, setSmartSpinner] = useState(false);

  // Detect provider capabilities after iframe loads
  useEffect(() => {
    setDetected(false);
    setSyncMode('passive');
  }, [embedUrl]);

  const handleIframeLoad = async () => {
    const mode = await detectProviderCapabilities(iframeRef, embedUrl);
    setSyncMode(mode);
    setDetected(true);
    // Notify server we are ready (passive sync uses this)
    socket.emit('client-ready', { roomId, userId });
  };

  // Smart sync
  const smartSync = useSmartSync({
    iframeRef,
    roomId,
    isHost,
    enabled: detected && syncMode === 'smart',
  });

  // Register spinner callback for smart sync
  useEffect(() => {
    smartSync.registerSpinnerCallback(setSmartSpinner);
  }, [smartSync]);

  // Listen to player-sync for smart mode
  useEffect(() => {
    if (syncMode !== 'smart' || !detected) return;
    const handler = (data: { action: string; currentTime: number; adjustedTime?: number; serverTime: number; playAt?: number; targetTime?: number }) => {
      const latency = (Date.now() - data.serverTime) / 2;
      const mobilePadding = isIOSDevice() ? 800 : isMobileDevice() ? 400 : 0;
      const effectiveTargetTime = data.targetTime ?? (data.currentTime + latency / 1000);
      const effectivePlayAt = data.playAt ? data.playAt + mobilePadding : undefined;
      smartSync.onPlayerSync({
        action: data.action,
        currentTime: effectiveTargetTime,
        playAt: effectivePlayAt,
      });
    };
    socket.on('player-sync', handler);
    return () => { socket.off('player-sync', handler); };
  }, [syncMode, detected, smartSync]);

  // Passive sync
  const passiveSync = usePassiveSync({
    iframeRef,
    roomId,
    userId,
    embedUrl,
    enabled: detected && syncMode === 'passive',
  });

  const showLoadingOverlay = !detected || (syncMode === 'passive' && passiveSync.showLoading);
  const loadingText = passiveSync.loadingText;

  return (
    <div className="absolute inset-0">
      <iframe
        key={embedUrl}
        ref={iframeRef}
        src={embedUrl}
        className="w-full h-full border-0"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        onLoad={handleIframeLoad}
      />

      {/* Invisible interaction overlay — captures first user click before play instruction */}
      {syncMode === 'passive' && passiveSync.showLoading && (
        <div
          className="absolute inset-0 z-20"
          style={{ pointerEvents: 'auto' }}
          onClick={passiveSync.markUserPlaying}
        />
      )}

      <LoadingOverlay visible={showLoadingOverlay} text={loadingText} />

      {/* Smart sync mini spinner */}
      {syncMode === 'smart' && smartSpinner && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
          <div className="w-6 h-6 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
        </div>
      )}

      {syncMode === 'passive' && (
        <PlayInstruction visible={passiveSync.showPlayInstruction} />
      )}

      {/* Discrete host badge visible to ALL participants — driven by the
          `host-changed` socket event and the global store. */}
      <HostBadge hostUsername={hostUsername} />

      <ResyncButton
        syncMode={syncMode}
        estimatedTime={passiveSync.estimatedTime}
        onSmartResync={smartSync.requestResync}
        onPassiveResync={passiveSync.requestResync}
      />
    </div>
  );
}
