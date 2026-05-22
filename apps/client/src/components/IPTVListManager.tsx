import { useEffect, useState } from 'react';
import { RotateCcw, Pencil, Trash2, Plus, List, Upload, Link } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { iptvApi } from '../lib/api';
import type { IPTVList } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ModalState {
    open: boolean;
    target: IPTVList | null;
    name: string;
    url: string;
    mode: 'url' | 'file';
    fileContent: string | null;
    fileName: string | null;
    saving: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function IPTVListManager() {
    const [lists, setLists] = useState<IPTVList[]>([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState<ModalState>({
        open: false,
        target: null,
        name: '',
        url: '',
        mode: 'url',
        fileContent: null,
        fileName: null,
        saving: false,
    });

    // ─── Load lists ────────────────────────────────────────────────────────────

    function loadLists() {
        setLoading(true);
        iptvApi
            .listAll()
            .then(({ data }) => setLists(data))
            .catch(() => toast.error('Error al cargar las listas'))
            .finally(() => setLoading(false));
    }

    useEffect(() => { loadLists(); }, []);

    // ─── Modal helpers ─────────────────────────────────────────────────────────

    function openCreate() {
        setModal({ open: true, target: null, name: '', url: '', mode: 'url', fileContent: null, fileName: null, saving: false });
    }

    function openEdit(list: IPTVList) {
        const isLocal = list.url === '(archivo local)';
        setModal({ open: true, target: list, name: list.name, url: isLocal ? '' : list.url, mode: isLocal ? 'file' : 'url', fileContent: null, fileName: null, saving: false });
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const content = ev.target?.result as string;
            setModal((m) => ({
                ...m,
                fileContent: content,
                fileName: file.name,
                // Auto-fill name from filename if still empty
                name: m.name || file.name.replace(/\.m3u8?$/i, ''),
            }));
        };
        reader.readAsText(file);
    }

    function closeModal() {
        setModal((m) => ({ ...m, open: false }));
    }

    // ─── Actions ───────────────────────────────────────────────────────────────

    async function handleSave() {
        const { target, name, url, mode, fileContent } = modal;
        if (!name.trim()) { toast.error('El nombre es obligatorio'); return; }
        if (mode === 'url' && !url.trim()) { toast.error('La URL es obligatoria'); return; }
        if (mode === 'file' && !fileContent) { toast.error('Selecciona un archivo .m3u'); return; }

        setModal((m) => ({ ...m, saving: true }));
        try {
            if (target) {
                const isLocal = target.url === '(archivo local)';
                // For local lists, only send name (server skips fetch)
                const patch = isLocal ? { name: name.trim() } : { name: name.trim(), url: url.trim() };
                const { data } = await iptvApi.update(target.id, patch);
                setLists((prev) => prev.map((l) => (l.id === data.id ? data : l)));
                toast.success(`Lista "${data.name}" actualizada — ${data.entryCount} entradas`);
            } else if (mode === 'file') {
                const { data } = await iptvApi.upload(name.trim(), fileContent!);
                setLists((prev) => [...prev, data]);
                toast.success(`Lista "${data.name}" cargada — ${data.entryCount} entradas`);
            } else {
                const { data } = await iptvApi.add(name.trim(), url.trim());
                setLists((prev) => [...prev, data]);
                toast.success(`Lista "${data.name}" cargada — ${data.entryCount} entradas`);
            }
            closeModal();
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error al guardar';
            toast.error(msg);
        } finally {
            setModal((m) => ({ ...m, saving: false }));
        }
    }

    async function handleToggle(list: IPTVList) {
        try {
            const { data } = await iptvApi.update(list.id, { enabled: !list.enabled });
            setLists((prev) => prev.map((l) => (l.id === data.id ? data : l)));
        } catch {
            toast.error('Error al actualizar la lista');
        }
    }

    async function handleRefresh(list: IPTVList) {
        const toastId = toast.loading(`Actualizando "${list.name}"…`);
        try {
            const { data } = await iptvApi.refresh(list.id);
            setLists((prev) => prev.map((l) => (l.id === data.id ? data : l)));
            toast.success(`Lista actualizada — ${data.entryCount} entradas`, { id: toastId });
        } catch {
            toast.error('Error al actualizar', { id: toastId });
        }
    }

    async function handleDelete(list: IPTVList) {
        if (!confirm(`¿Eliminar la lista "${list.name}"? Esta acción no se puede deshacer.`)) return;
        try {
            await iptvApi.remove(list.id);
            setLists((prev) => prev.filter((l) => l.id !== list.id));
            toast.success('Lista eliminada');
        } catch {
            toast.error('Error al eliminar');
        }
    }

    // ─── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-4">
            {/* Header row */}
            <div className="flex items-center justify-between">
                <p className="text-sm text-white/40">
                    {lists.length} lista{lists.length !== 1 ? 's' : ''}
                </p>
                <Button size="sm" onClick={openCreate}>
                    <Plus className="h-3.5 w-3.5" /> Nueva lista
                </Button>
            </div>

            {/* Table */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="w-5 h-5 border-2 border-accent-muted border-t-accent rounded-full animate-spin" />
                </div>
            ) : lists.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-white/30 gap-3">
                    <List className="h-10 w-10" />
                    <p className="text-sm">No hay listas IPTV. Añade una con el botón "Nueva lista".</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-xs text-white/40 border-b border-white/[0.06]">
                                <th className="text-left pb-3 pr-4">Nombre</th>
                                <th className="text-left pb-3 pr-4">URL</th>
                                <th className="text-right pb-3 pr-4">Entradas</th>
                                <th className="text-left pb-3 pr-4">Última actualización</th>
                                <th className="text-center pb-3 pr-4">Activa</th>
                                <th className="pb-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04]">
                            {lists.map((list) => (
                                <tr key={list.id} className="hover:bg-white/[0.02]">
                                    {/* Name */}
                                    <td className="py-3 pr-4 text-white font-medium whitespace-nowrap">
                                        {list.name}
                                    </td>

                                    {/* URL truncated */}
                                    <td className="py-3 pr-4 max-w-[240px]">
                                        <span
                                            className="block truncate text-white/40 font-mono text-xs"
                                            title={list.url}
                                        >
                                            {list.url}
                                        </span>
                                    </td>

                                    {/* Entry count */}
                                    <td className="py-3 pr-4 text-right text-white/60 tabular-nums">
                                        {list.entryCount.toLocaleString('es')}
                                    </td>

                                    {/* Last fetched */}
                                    <td className="py-3 pr-4 text-white/40 text-xs whitespace-nowrap">
                                        {new Date(list.lastFetched).toLocaleString('es')}
                                    </td>

                                    {/* Toggle enabled */}
                                    <td className="py-3 pr-4 text-center">
                                        <button
                                            onClick={() => handleToggle(list)}
                                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${list.enabled ? 'bg-accent' : 'bg-white/10'
                                                }`}
                                            title={list.enabled ? 'Desactivar lista' : 'Activar lista'}
                                        >
                                            <span
                                                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${list.enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                                                    }`}
                                            />
                                        </button>
                                    </td>

                                    {/* Actions */}
                                    <td className="py-3 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                onClick={() => handleRefresh(list)}
                                                disabled={list.url === '(archivo local)'}
                                                title={list.url === '(archivo local)' ? 'Lista local — no se puede actualizar remotamente' : 'Re-fetch y re-parse'}
                                                className="p-1.5 text-white/30 hover:text-accent-light hover:bg-accent-subtle rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-white/30 disabled:hover:bg-transparent"
                                            >
                                                <RotateCcw className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                                onClick={() => openEdit(list)}
                                                title="Editar lista"
                                                className="p-1.5 text-white/30 hover:text-white hover:bg-white/8 rounded-lg transition-colors"
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(list)}
                                                title="Eliminar lista"
                                                className="p-1.5 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Create / Edit Modal */}
            <Modal
                open={modal.open}
                onClose={closeModal}
                title={modal.target ? 'Editar lista IPTV' : 'Nueva lista IPTV'}
                maxWidth="max-w-lg"
            >
                <div className="space-y-4">
                    <Input
                        label="Nombre"
                        id="iptv-name"
                        placeholder="Ej: Deportes HD"
                        value={modal.name}
                        onChange={(e) => setModal((m) => ({ ...m, name: e.target.value }))}
                        autoFocus
                    />
                    {/* Source mode toggle (only on create) */}
                    {!modal.target && (
                        <div className="flex rounded-lg overflow-hidden border border-white/[0.08] text-sm">
                            <button
                                type="button"
                                onClick={() => setModal((m) => ({ ...m, mode: 'url' }))}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 transition-colors ${modal.mode === 'url'
                                    ? 'bg-accent-muted text-accent-lighter'
                                    : 'text-white/40 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                <Link className="h-3.5 w-3.5" /> URL
                            </button>
                            <button
                                type="button"
                                onClick={() => setModal((m) => ({ ...m, mode: 'file' }))}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 transition-colors ${modal.mode === 'file'
                                    ? 'bg-accent-muted text-accent-lighter'
                                    : 'text-white/40 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                <Upload className="h-3.5 w-3.5" /> Archivo local
                            </button>
                        </div>
                    )}

                    {/* URL input — shown when creating via URL, or editing a remote list */}
                    {((!modal.target && modal.mode === 'url') || (modal.target && modal.target.url !== '(archivo local)')) && (
                        <>
                            <Input
                                label="URL de la lista (.m3u / .m3u8)"
                                id="iptv-url"
                                placeholder="https://example.com/lista.m3u"
                                value={modal.url}
                                onChange={(e) => setModal((m) => ({ ...m, url: e.target.value }))}
                            />
                            <p className="text-xs text-white/30">
                                El servidor descargará y parseará la lista automáticamente al guardar.
                            </p>
                        </>
                    )}

                    {/* Local file note — shown when editing a locally-uploaded list */}
                    {modal.target && modal.target.url === '(archivo local)' && (
                        <div className="flex items-center gap-2 rounded-lg bg-accent-muted border border-accent-muted px-3 py-2.5 text-xs text-accent-lighter">
                            <Upload className="h-3.5 w-3.5 shrink-0" />
                            Lista cargada desde archivo local. Solo puedes cambiar el nombre.
                        </div>
                    )}

                    {/* File upload input */}
                    {!modal.target && modal.mode === 'file' && (
                        <div className="space-y-2">
                            <label className="block text-xs text-white/50 mb-1">Archivo .m3u / .m3u8</label>
                            <label
                                className={`flex flex-col items-center justify-center gap-2 w-full h-28 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${modal.fileContent
                                    ? 'border-accent-muted bg-accent-subtle'
                                    : 'border-white/10 hover:border-white/20 hover:bg-white/[0.02]'
                                    }`}
                            >
                                <input
                                    type="file"
                                    accept=".m3u,.m3u8,audio/x-mpegurl,application/x-mpegurl"
                                    className="sr-only"
                                    onChange={handleFileChange}
                                />
                                {modal.fileContent ? (
                                    <>
                                        <Upload className="h-5 w-5 text-accent-light" />
                                        <span className="text-sm text-accent-lighter font-medium">{modal.fileName}</span>
                                        <span className="text-xs text-white/30">Click para cambiar</span>
                                    </>
                                ) : (
                                    <>
                                        <Upload className="h-5 w-5 text-white/20" />
                                        <span className="text-sm text-white/40">Arrastra o haz click para subir</span>
                                        <span className="text-xs text-white/20">.m3u / .m3u8</span>
                                    </>
                                )}
                            </label>
                        </div>
                    )}
                    <div className="flex gap-2 pt-1 justify-end">
                        <Button variant="ghost" onClick={closeModal} disabled={modal.saving}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSave} disabled={modal.saving}>
                            {modal.saving ? (
                                <span className="flex items-center gap-2">
                                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    {modal.target ? 'Actualizando…' : 'Cargando…'}
                                </span>
                            ) : modal.target ? (
                                'Actualizar'
                            ) : (
                                'Crear lista'
                            )}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
