import { useState } from 'react';
import { clsx } from 'clsx';
import { X, GripVertical, Play, Trash2 } from 'lucide-react';
import { socket } from '../lib/socket';
import type { QueueItem } from '../types';

interface QueuePanelProps {
    queue: QueueItem[];
    roomId: string;
    currentUsername: string | null;
    isAdmin: boolean;
}

export default function QueuePanel({ queue, roomId, currentUsername, isAdmin }: QueuePanelProps) {
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    function handleDragStart(e: React.DragEvent<HTMLLIElement>, index: number) {
        e.dataTransfer.setData('text/plain', String(index));
        e.dataTransfer.effectAllowed = 'move';
    }

    function handleDragOver(e: React.DragEvent<HTMLLIElement>, index: number) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverIndex(index);
    }

    function handleDrop(e: React.DragEvent<HTMLLIElement>, toIndex: number) {
        e.preventDefault();
        setDragOverIndex(null);
        const fromIndex = Number(e.dataTransfer.getData('text/plain'));
        if (fromIndex === toIndex) return;
        socket.emit('queue-reorder', { roomId, fromIndex, toIndex });
    }

    function handleRemove(itemId: string) {
        socket.emit('queue-remove', { roomId, itemId });
    }

    return (
        <div className="flex flex-col h-full bg-raised border border-white/[0.08] rounded-xl overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-white/[0.07] flex-shrink-0 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-white">Cola</h3>
                    <p className="text-xs text-white/40 mt-0.5">
                        {queue.length} {queue.length !== 1 ? 'videos' : 'video'}
                    </p>
                </div>
                {isAdmin && queue.length > 0 && (
                    <button
                        onClick={() => socket.emit('queue-clear', { roomId })}
                        title="Limpiar cola"
                        className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        Limpiar
                    </button>
                )}
            </div>

            {/* Body */}
            {queue.length === 0 ? (
                <div className="flex-1 flex items-center justify-center px-4 py-8">
                    <p className="text-sm text-white/40">Queue is empty</p>
                </div>
            ) : (
                <ul className="flex-1 overflow-y-auto py-2 divide-y divide-white/[0.04]">
                    {queue.map((item, index) => {
                        const canRemove = item.addedBy === currentUsername || isAdmin;
                        const isDragTarget = dragOverIndex === index;

                        return (
                            <li
                                key={item.id}
                                draggable={isAdmin}
                                onDragStart={isAdmin ? (e) => handleDragStart(e, index) : undefined}
                                onDragOver={isAdmin ? (e) => handleDragOver(e, index) : undefined}
                                onDragLeave={isAdmin ? () => setDragOverIndex(null) : undefined}
                                onDrop={isAdmin ? (e) => handleDrop(e, index) : undefined}
                                onDragEnd={isAdmin ? () => setDragOverIndex(null) : undefined}
                                className={clsx(
                                    'flex items-center gap-3 px-3 py-2 group transition-colors select-none',
                                    isAdmin && 'cursor-grab active:cursor-grabbing',
                                    isDragTarget
                                        ? 'bg-accent-muted border-l-2 border-accent'
                                        : 'hover:bg-white/[0.04]',
                                )}
                            >
                                {/* Drag handle (admin only) */}
                                {isAdmin && (
                                    <GripVertical className="h-4 w-4 flex-shrink-0 text-white/20 group-hover:text-white/40 transition-colors" />
                                )}

                                {/* Thumbnail */}
                                {item.thumbnail ? (
                                    <img
                                        src={item.thumbnail}
                                        alt={item.title}
                                        width={48}
                                        height={28}
                                        className="flex-shrink-0 rounded object-cover bg-white/[0.06]"
                                    />
                                ) : (
                                    <div
                                        className="flex-shrink-0 rounded bg-white/[0.06] flex items-center justify-center"
                                        style={{ width: 48, height: 28 }}
                                    >
                                        <Play className="h-3 w-3 text-white/20" />
                                    </div>
                                )}

                                {/* Title + added-by */}
                                <div className="flex-1 min-w-0">
                                    <span className="block text-sm text-white truncate leading-tight">
                                        {item.title}
                                    </span>
                                    <span className="text-xs text-gray-400 truncate">{item.addedBy}</span>
                                </div>

                                {/* Remove button */}
                                {canRemove && (
                                    <button
                                        onClick={() => handleRemove(item.id)}
                                        title="Remove from queue"
                                        className={clsx(
                                            'flex-shrink-0 p-1 rounded transition-all',
                                            'text-white/30 hover:text-red-400 hover:bg-red-500/10',
                                            'opacity-0 group-hover:opacity-100',
                                        )}
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
