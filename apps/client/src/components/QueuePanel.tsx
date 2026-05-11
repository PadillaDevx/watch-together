// TODO: Full implementation in Feature 7
import type { QueueItem } from '../types';

interface QueuePanelProps {
  queue: QueueItem[];
  roomId: string;
  currentUsername: string | null;
  isAdmin: boolean;
}

export default function QueuePanel(_props: QueuePanelProps) {
  return null;
}
