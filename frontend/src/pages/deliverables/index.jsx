import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, Filter, Download, Upload, RefreshCw,
  ChevronLeft, ChevronRight, Edit3, Trash2, Eye, FileText
} from 'lucide-react';
import { deliverablesAPI, schemasAPI, usersAPI, exportAPI, downloadBlob } from '../utils/api';
import { useProjectStore, useAuthStore } from '../hooks/useAuth';
import {
  StatusBadge, CodeChip, PageLoader, EmptyState,
  ConfirmModal, Modal, STATUS_OPTIONS
} from '../components/shared';
import DeliverableForm from '../components/deliverables/DeliverableForm';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';

export default function DeliverablesPage() {
  const { currentProject } = useProjectStore();
  const { isManagerUp } = useAuthStore();
  const queryClient = useQueryClient();
  const projectId = currentProject?.id;

  const [filters, setFilters] = useState({ search: '', status: '', page: 1, limit: 50 });
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [exportLoading, setExportLoading] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: delData, isLoading } = useQuery({
    queryKey: ['deliverables', projectId, filters],
    queryFn: () => deliverablesAPI.list(projectId, {
      ...filters, search: filters.search || undefined,
      status: filters.status || undefined
    }).then(r => r.data),
    enabled: !!projectId,
  });

  const { data: schemas = [] } = useQuery({
    queryKey: ['schemas', projectId],
    queryFn: () => schemasAPI.list(projectId).then(r => r.data),
    enabled: !!projectId,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersAPI.list().then(r => r.data),
  });

  // ── Handlers ─────────────────────────────────────────────────────────────
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['deliverables', projectId] });

  const handleCreate = async (data) => {
    await deliverablesAPI.create(projectId, data);
    toast.success('Entregable creado correctamente.');
    setShowCreate(false);
    refresh();
  };

  const handleUpdate = async (data) => {
    await deliverablesAPI.update(projectId, editing.id, data);
    toast.success('Entregable actualizado.');
    setEditing(null);
    refresh();
  };

  const handleDelete = async () => {
    await deliverablesAPI.delete(projectId, deleteTarget.id);
    toast.success('Entregable eliminado.');
    setDeleteTarget(null);
    refresh();
  };

  const handleExport = async (format) => {
    setExportLoading(true);
    try {
      const res = await exportAPI[format](projectId, {
        status: filters.status || undefined,
      });
      const ext = { excel: 'xlsx', json: 'json', csv: 'csv' }[format];
      downloadBlob(res.data, `MIDP_${currentProject?.code}_${Date.now()}.${ext}`);
      toast.success(`Exportado como .${ext}`);
    } catch {
      toast.error('Error al exportar.');
    } finally {
      setExportLoading(false);
    }
  };

  const { data: deliverables = [], pagination } = {
    data: delData?.data || [],
    pagination: delData?.pagination,
  };

  if (!projectId) return (
    <div className="p-8">
      <EmptyState title="Sin proyecto activo"
        description="Seleccione un proyecto en Administración → Proyectos." />
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display font-bold text-2xl text-surface-900">Entregables</h1>
          <p className="text-sm text-surface-400 mt-0.5">
            {pagination?.total ?? 0} entregables · {currentProject?.name}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Export dropdown */}
          <div className="relative group">
            <button className="btn-secondary" disabled={exportLoading}>
              <Download size={14} /> Exportar
            </button>
            <div className="absolute right-0 top-full mt-1 w-36 card shadow-card-hover py-1 z-10
                            hidden group-hover:block animate-fadeIn">
              {['excel', 'csv', 'json'].map(fmt => (
                <button key={fmt} onClick={() => handleExport(fmt)}
                  className="w-full text-left px-3 py-2 text-sm text-surface-700 hover:bg-surface-50">
                  {fmt === 'excel' ? '📊 Excel (.xlsx)' :
                   fmt === 'csv' ? '📄 CSV (.csv)' : '🔷 JSON (.json)'}
                </button>
              ))}
            </div>
          </div>
          <Link href="/import">
            <button className="btn-secondary"><Upload size={14} /> Importar</button>
          </Link>
          {isManagerUp() && (
            <button className="btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={14} /> Nuevo entregable
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input type="text" className="input pl-9" placeholder="Buscar por código o nombre..."
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value, page: 1 }))} />
        </div>
        <select className="select w-40" value={filters.status}
          onChange={e => setFilters(f => ({ ...f, status: e.target.value, page: 1 }))}>
          <option value="">Todos los estados</option>
          {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button className="btn-ghost p-2" onClick={refresh} title="Refrescar">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? <PageLoader /> : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Estado</th>
                  <th>Responsable</th>
                  <th>Fecha plan.</th>
                  <th>Avance</th>
                  <th>Ver.</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {deliverables.map(d => (
                  <tr key={d.id}>
                    <td><CodeChip code={d.code} /></td>
                    <td>
                      <div className="max-w-xs">
                        <p className="text-surface-800 font-medium text-sm truncate">{d.name}</p>
                        {d.description && (
                          <p className="text-xs text-surface-400 truncate">{d.description}</p>
                        )}
                      </div>
                    </td>
                    <td><StatusBadge status={d.status} /></td>
                    <td>
                      {d.assigned_to_name
                        ? <div>
                            <p className="text-xs font-medium text-surface-700">{d.assigned_to_name}</p>
                            <p className="text-[10px] text-surface-400">{d.assigned_to_specialty || ''}</p>
                          </div>
                        : <span className="text-xs text-surface-300">Sin asignar</span>
                      }
                    </td>
                    <td>
                      {d.planned_date
                        ? <span className="text-xs text-surface-600">
                            {format(new Date(d.planned_date), "d MMM yyyy", { locale: es })}
                          </span>
                        : <span className="text-xs text-surface-300">—</span>
                      }
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="progress-bar w-16">
                          <div className="progress-fill"
                            style={{ width: `${d.progress_pct || 0}%` }} />
                        </div>
                        <span className="text-xs text-surface-500">{d.progress_pct || 0}%</span>
                      </div>
                    </td>
                    <td>
                      <span className="text-xs font-mono text-surface-400">v{d.version}</span>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/deliverables/${d.id}`}>
                          <button className="btn-ghost p-1.5" title="Ver detalle">
                            <Eye size={13} />
                          </button>
                        </Link>
                        {isManagerUp() && (
                          <>
                            <button className="btn-ghost p-1.5" title="Editar"
                              onClick={() => setEditing(d)}>
                              <Edit3 size={13} />
                            </button>
                            <button className="btn-ghost p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50"
                              title="Eliminar" onClick={() => setDeleteTarget(d)}>
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {deliverables.length === 0 && (
              <EmptyState icon={FileText}
                title="No hay entregables"
                description="Crea el primero o importa desde Excel."
                action={isManagerUp() && (
                  <button className="btn-primary" onClick={() => setShowCreate(true)}>
                    <Plus size={14} /> Nuevo entregable
                  </button>
                )}
              />
            )}
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-surface-100">
            <p className="text-xs text-surface-400">
              Mostrando {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total}
            </p>
            <div className="flex gap-1">
              <button className="btn-ghost p-1.5" disabled={pagination.page <= 1}
                onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}>
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs text-surface-600 px-2 py-1.5">
                {pagination.page} / {pagination.pages}
              </span>
              <button className="btn-ghost p-1.5" disabled={pagination.page >= pagination.pages}
                onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)}
        title="Nuevo entregable" size="lg">
        <DeliverableForm schemas={schemas} projectId={projectId}
          users={users} onSubmit={handleCreate} />
      </Modal>

      {/* Edit modal */}
      <Modal isOpen={!!editing} onClose={() => setEditing(null)}
        title={`Editar: ${editing?.code}`} size="lg">
        {editing && (
          <DeliverableForm schemas={schemas} projectId={projectId}
            users={users} initial={editing} onSubmit={handleUpdate} />
        )}
      </Modal>

      {/* Delete confirm */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="¿Eliminar entregable?"
        message={`Se eliminará "${deleteTarget?.name}" (${deleteTarget?.code}). Esta acción no es reversible.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        danger
      />
    </div>
  );
}
