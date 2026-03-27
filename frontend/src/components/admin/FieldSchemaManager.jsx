import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  GripVertical, Plus, Trash2, Edit3, ChevronDown, ChevronUp,
  Check, X, AlertCircle, List, Type, Hash, Calendar, ToggleLeft
} from 'lucide-react';
import { schemasAPI } from '../../utils/api';
import { FieldTypeLabel, Modal, ConfirmModal } from '../shared';
import toast from 'react-hot-toast';

const FIELD_TYPE_ICONS = {
  text:     Type,
  dropdown: List,
  number:   Hash,
  date:     Calendar,
  boolean:  ToggleLeft,
};

export default function FieldSchemaManager({ schemas, projectId, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm();
  const watchType = watch('field_type', 'text');
  const watchAllowedValues = watch('allowed_values_raw', '');

  const openCreate = () => { reset({}); setEditing(null); setShowForm(true); };
  const openEdit = (schema) => {
    reset({
      name: schema.name,
      field_type: schema.field_type,
      is_required: schema.is_required,
      is_part_of_code: schema.is_part_of_code,
      code_order: schema.code_order,
      separator: schema.separator,
      max_length: schema.max_length,
      description: schema.description,
      allowed_values_raw: schema.allowed_values
        ? schema.allowed_values.map(v => `${v.value}|${v.label}`).join('\n')
        : '',
    });
    setEditing(schema);
    setShowForm(true);
  };

  const parseAllowedValues = (raw) => {
    if (!raw?.trim()) return null;
    return raw.trim().split('\n').map(line => {
      const [value, ...rest] = line.split('|');
      return { value: value.trim(), label: rest.join('|').trim() || value.trim() };
    }).filter(v => v.value);
  };

  const onSubmit = async (data) => {
    try {
      const payload = {
        name: data.name,
        field_type: data.field_type,
        is_required: data.is_required === true || data.is_required === 'true',
        is_part_of_code: data.is_part_of_code === true || data.is_part_of_code === 'true',
        code_order: data.code_order ? parseInt(data.code_order) : null,
        separator: data.separator ?? '-',
        max_length: data.max_length ? parseInt(data.max_length) : 10,
        description: data.description,
        allowed_values: parseAllowedValues(data.allowed_values_raw),
      };

      if (editing) {
        await schemasAPI.update(projectId, editing.id, payload);
        toast.success('Campo actualizado correctamente.');
      } else {
        const key = data.name
          .toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '');
        await schemasAPI.create(projectId, { ...payload, key });
        toast.success('Campo creado correctamente.');
      }
      setShowForm(false);
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar el campo.');
    }
  };

  const onDelete = async () => {
    try {
      await schemasAPI.delete(projectId, deleteTarget.id);
      toast.success('Campo eliminado.');
      setDeleteTarget(null);
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se puede eliminar este campo.');
      setDeleteTarget(null);
    }
  };

  const sorted = [...schemas].sort((a, b) => (a.code_order ?? 99) - (b.code_order ?? 99));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display font-semibold text-surface-900">Campos de codificación</h2>
          <p className="text-xs text-surface-400 mt-0.5">
            Define la estructura del código de entregables. Los campos marcados con
            <span className="mx-1 font-mono text-[9px] bg-brand-100 text-brand-600 px-1 py-0.5 rounded">código</span>
            se concatenan en orden para generar el código único.
          </p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <Plus size={15} /> Nuevo campo
        </button>
      </div>

      {/* Code preview example */}
      {sorted.filter(s => s.is_part_of_code).length > 0 && (
        <div className="card p-4 mb-4 bg-surface-50">
          <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-widest mb-2">
            Estructura del código resultante
          </p>
          <div className="flex items-center flex-wrap gap-1">
            {sorted.filter(s => s.is_part_of_code && s.is_active).map((s, i, arr) => (
              <span key={s.id} className="flex items-center gap-1">
                <span className="font-mono text-sm bg-white border border-surface-200
                                 text-brand-700 px-2 py-0.5 rounded shadow-sm">
                  {s.allowed_values?.[0]?.value || `[${s.name.toUpperCase().slice(0,3)}]`}
                </span>
                {i < arr.length - 1 && s.separator && (
                  <span className="text-surface-300 font-mono text-sm">{s.separator}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Schema list */}
      <div className="space-y-2">
        {sorted.map((schema, idx) => {
          const Icon = FIELD_TYPE_ICONS[schema.field_type] || Type;
          const isExpanded = expandedId === schema.id;
          return (
            <div key={schema.id}
              className={`card border transition-all duration-150
                ${schema.is_active ? '' : 'opacity-50'}
                ${isExpanded ? 'border-brand-200 shadow-glow' : 'border-surface-200'}`}>
              <div className="p-3 flex items-center gap-3">
                <GripVertical size={14} className="text-surface-300 cursor-grab shrink-0" />

                {/* Code order badge */}
                {schema.is_part_of_code && schema.code_order && (
                  <span className="w-5 h-5 rounded-full bg-brand-100 text-brand-600
                                   text-[10px] font-bold flex items-center justify-center shrink-0">
                    {schema.code_order}
                  </span>
                )}
                {!schema.is_part_of_code && (
                  <span className="w-5 h-5 rounded-full bg-surface-100 text-surface-400
                                   text-[10px] font-bold flex items-center justify-center shrink-0">
                    —
                  </span>
                )}

                <Icon size={14} className="text-surface-400 shrink-0" />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-surface-800">{schema.name}</span>
                    <span className="font-mono text-[10px] text-surface-400 bg-surface-100
                                     px-1.5 py-0.5 rounded">.{schema.key}</span>
                    <FieldTypeLabel type={schema.field_type} />
                    {schema.is_required && (
                      <span className="text-[10px] text-red-500 font-medium">obligatorio</span>
                    )}
                    {schema.is_part_of_code && (
                      <span className="text-[10px] font-mono bg-brand-50 text-brand-600
                                       border border-brand-200 px-1 py-0.5 rounded">
                        código{schema.separator ? ` + "${schema.separator}"` : ''}
                      </span>
                    )}
                  </div>
                  {schema.description && (
                    <p className="text-[11px] text-surface-400 truncate mt-0.5">{schema.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button className="btn-ghost p-1.5" onClick={() => openEdit(schema)} title="Editar">
                    <Edit3 size={13} />
                  </button>
                  <button className="btn-ghost p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50"
                    onClick={() => setDeleteTarget(schema)} title="Eliminar">
                    <Trash2 size={13} />
                  </button>
                  <button className="btn-ghost p-1.5" onClick={() => setExpandedId(isExpanded ? null : schema.id)}>
                    {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                </div>
              </div>

              {/* Expanded: show allowed values */}
              {isExpanded && schema.allowed_values && (
                <div className="px-4 pb-4 border-t border-surface-100 pt-3">
                  <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wide mb-2">
                    Valores permitidos ({schema.allowed_values.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {schema.allowed_values.map(v => (
                      <span key={v.value}
                        className="flex items-center gap-1.5 font-mono text-[11px]
                                   bg-surface-50 border border-surface-200 px-2 py-1 rounded">
                        <span className="font-bold text-brand-700">{v.value}</span>
                        <span className="text-surface-400">→</span>
                        <span className="text-surface-600">{v.label}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {schemas.length === 0 && (
        <div className="card p-12 text-center">
          <p className="text-surface-400 text-sm">No hay campos configurados.</p>
          <p className="text-surface-300 text-xs mt-1">Crea el primer campo para comenzar a definir la estructura del código.</p>
        </div>
      )}

      {/* ── Create/Edit Modal ── */}
      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? `Editar campo: ${editing.name}` : 'Nuevo campo de codificación'}
        size="md"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Nombre del campo <span className="text-red-500">*</span></label>
              <input type="text" className="input"
                placeholder="Ej: Disciplina, Fase, Zona, Nivel..."
                {...register('name', { required: true })} />
            </div>

            <div>
              <label className="label">Tipo de campo <span className="text-red-500">*</span></label>
              <select className="select" {...register('field_type', { required: true })}>
                <option value="text">Texto libre</option>
                <option value="dropdown">Lista desplegable</option>
                <option value="number">Número</option>
                <option value="date">Fecha</option>
                <option value="boolean">Verdadero/Falso</option>
              </select>
            </div>

            <div>
              <label className="label">Longitud máxima</label>
              <input type="number" className="input" min={1} max={50}
                placeholder="10" {...register('max_length')} />
            </div>

            <div className="flex items-center gap-4 col-span-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" {...register('is_required')}
                  className="w-4 h-4 rounded border-surface-300 text-brand-500 focus:ring-brand-400" />
                <span className="text-sm text-surface-700">Campo obligatorio</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" {...register('is_part_of_code')}
                  className="w-4 h-4 rounded border-surface-300 text-brand-500 focus:ring-brand-400" />
                <span className="text-sm text-surface-700">Incluir en código</span>
              </label>
            </div>

            <div>
              <label className="label">Posición en código (orden)</label>
              <input type="number" className="input" min={1} max={20}
                placeholder="Ej: 1, 2, 3..." {...register('code_order')} />
            </div>

            <div>
              <label className="label">Separador después</label>
              <input type="text" className="input" maxLength={5}
                placeholder='Ej: - / . (vacío = sin separador)'
                {...register('separator')} />
            </div>

            <div className="col-span-2">
              <label className="label">Descripción / ayuda</label>
              <input type="text" className="input"
                placeholder="Texto de ayuda para el usuario"
                {...register('description')} />
            </div>

            {watchType === 'dropdown' && (
              <div className="col-span-2">
                <label className="label">
                  Valores permitidos
                  <span className="ml-1 text-[10px] text-surface-400 normal-case tracking-normal">
                    (un valor por línea: CÓDIGO|Etiqueta)
                  </span>
                </label>
                <textarea
                  className="input font-mono text-xs resize-none"
                  rows={7}
                  placeholder={"ARQ|Arquitectura\nEST|Estructuras\nHID|Hidráulica\nSAN|Sanitarias\nELE|Eléctricas"}
                  {...register('allowed_values_raw')}
                />
                {watchAllowedValues && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {parseAllowedValues(watchAllowedValues)?.map(v => (
                      <span key={v.value}
                        className="font-mono text-[10px] bg-brand-50 border border-brand-200 text-brand-700 px-1.5 py-0.5 rounded">
                        {v.value} → {v.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-3 justify-end pt-2 border-t border-surface-100">
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              <Check size={14} /> {editing ? 'Actualizar' : 'Crear campo'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Delete confirm ── */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title={`¿Eliminar campo "${deleteTarget?.name}"?`}
        message="Si hay entregables que usan este campo en su código, la operación será bloqueada."
        onConfirm={onDelete}
        onCancel={() => setDeleteTarget(null)}
        danger
      />
    </div>
  );
}
