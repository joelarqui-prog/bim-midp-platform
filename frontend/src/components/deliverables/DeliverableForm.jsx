import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { AlertCircle, Loader2, CheckCircle2, RefreshCw } from 'lucide-react';
import { deliverablesAPI } from '../../utils/api';
import { STATUS_OPTIONS } from '../shared';
import toast from 'react-hot-toast';

/**
 * DeliverableForm - Dynamic form driven by field schemas.
 * Renders each schema field according to its type, and builds
 * the deliverable code in real-time as the user fills in values.
 */
export default function DeliverableForm({ schemas, projectId, onSubmit, initial, users = [] }) {
  const [codePreview, setCodePreview] = useState('');
  const [codeStatus, setCodeStatus] = useState(null); // null | 'checking' | 'ok' | 'duplicate'
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, watch, formState: { errors }, setValue, reset } = useForm({
    defaultValues: initial
      ? {
          name: initial.name,
          description: initial.description,
          status: initial.status,
          assigned_to: initial.assigned_to,
          planned_date: initial.planned_date?.slice(0, 10),
          actual_date: initial.actual_date?.slice(0, 10),
          ...initial.field_values,
        }
      : { status: 'pending' },
  });

  const watchedValues = watch();

  // ── Build code preview in real-time ────────────────────────────────────────
  const buildCodePreview = useCallback(() => {
    const codeParts = schemas
      .filter(s => s.is_part_of_code && s.is_active)
      .sort((a, b) => (a.code_order ?? 99) - (b.code_order ?? 99));

    let code = '';
    for (let i = 0; i < codeParts.length; i++) {
      const schema = codeParts[i];
      const value = watchedValues[schema.key];
      if (!value) continue;
      code += String(value).substring(0, schema.max_length);
      if (i < codeParts.length - 1 && schema.separator) code += schema.separator;
    }
    return code;
  }, [watchedValues, schemas]);

  useEffect(() => {
    const preview = buildCodePreview();
    setCodePreview(preview);
  }, [buildCodePreview]);

  // ── Validate code uniqueness (debounced) ───────────────────────────────────
  useEffect(() => {
    if (!codePreview || codePreview.length < 4) {
      setCodeStatus(null);
      return;
    }
    setCodeStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const fieldVals = {};
        schemas.forEach(s => {
          if (watchedValues[s.key]) fieldVals[s.key] = watchedValues[s.key];
        });
        const { data } = await deliverablesAPI.validateCode(
          projectId, fieldVals, initial?.id
        );
        setCodeStatus(data.is_duplicate ? 'duplicate' : 'ok');
      } catch {
        setCodeStatus(null);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [codePreview, projectId, initial?.id]);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const onFormSubmit = async (data) => {
    if (codeStatus === 'duplicate') {
      toast.error('El código generado está duplicado. Cambie los valores de los campos.');
      return;
    }

    const field_values = {};
    schemas.forEach(s => {
      if (data[s.key] !== undefined) {
        field_values[s.key] = data[s.key];
        delete data[s.key];
      }
    });

    setIsSubmitting(true);
    try {
      await onSubmit({ ...data, field_values });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar el entregable.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Render a single field by type ─────────────────────────────────────────
  const renderField = (schema) => {
    const required = schema.is_required;
    const fieldError = errors[schema.key];

    const fieldProps = {
      id: schema.key,
      ...register(schema.key, {
        required: required ? `"${schema.name}" es obligatorio.` : false,
        maxLength: schema.max_length
          ? { value: schema.max_length, message: `Máximo ${schema.max_length} caracteres.` }
          : undefined,
        pattern: schema.validation_regex
          ? { value: new RegExp(schema.validation_regex), message: 'Formato inválido.' }
          : undefined,
      }),
    };

    let input;
    switch (schema.field_type) {
      case 'dropdown':
        input = (
          <select className={fieldError ? 'input-error select' : 'select'} {...fieldProps}>
            <option value="">— Seleccionar —</option>
            {(schema.allowed_values || []).map(opt => (
              <option key={opt.value} value={opt.value}>{opt.value} — {opt.label}</option>
            ))}
          </select>
        );
        break;
      case 'number':
        input = (
          <input type="number" step="1"
            className={fieldError ? 'input-error' : 'input'} {...fieldProps}
            placeholder="Ej: 0001" />
        );
        break;
      case 'date':
        input = (
          <input type="date"
            className={fieldError ? 'input-error' : 'input'} {...fieldProps} />
        );
        break;
      case 'boolean':
        input = (
          <div className="flex items-center gap-3 mt-1">
            <input type="checkbox" id={schema.key} {...register(schema.key)}
              className="w-4 h-4 rounded border-surface-300 text-brand-500
                         focus:ring-brand-400 cursor-pointer" />
            <label htmlFor={schema.key} className="text-sm text-surface-700 cursor-pointer">
              {schema.name}
            </label>
          </div>
        );
        break;
      default:
        input = (
          <input type="text"
            className={fieldError ? 'input-error' : 'input'} {...fieldProps}
            placeholder={schema.description || schema.name}
            maxLength={schema.max_length} />
        );
    }

    return (
      <div key={schema.id}>
        {schema.field_type !== 'boolean' && (
          <label htmlFor={schema.key} className="label">
            {schema.name}
            {required && <span className="text-red-500 ml-0.5">*</span>}
            {schema.is_part_of_code && (
              <span className="ml-1.5 font-mono text-[9px] bg-brand-100 text-brand-600
                               px-1 py-0.5 rounded normal-case tracking-normal">
                código #{schema.code_order}
              </span>
            )}
          </label>
        )}
        {input}
        {fieldError && (
          <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
            <AlertCircle size={10} /> {fieldError.message}
          </p>
        )}
        {schema.description && (
          <p className="text-[10px] text-surface-400 mt-0.5">{schema.description}</p>
        )}
      </div>
    );
  };

  // ── Separate code-part fields from extra metadata fields ───────────────────
  const codeFields = schemas.filter(s => s.is_part_of_code && s.is_active)
    .sort((a, b) => (a.code_order ?? 99) - (b.code_order ?? 99));
  const metaFields = schemas.filter(s => !s.is_part_of_code && s.is_active);

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="p-5 space-y-6">

      {/* ── Code preview ────────────────────────────────────────────────── */}
      <div className="bg-surface-50 border border-surface-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-surface-500 uppercase tracking-wide">
            Código generado automáticamente
          </span>
          {codeStatus === 'checking' && (
            <span className="flex items-center gap-1 text-xs text-surface-400">
              <RefreshCw size={11} className="animate-spin" /> Verificando...
            </span>
          )}
          {codeStatus === 'ok' && (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle2 size={11} /> Disponible
            </span>
          )}
          {codeStatus === 'duplicate' && (
            <span className="flex items-center gap-1 text-xs text-red-600">
              <AlertCircle size={11} /> ¡Código duplicado!
            </span>
          )}
        </div>
        <div className={`font-mono text-xl font-bold tracking-wide
          ${codeStatus === 'duplicate' ? 'text-red-600' :
            codeStatus === 'ok' ? 'text-emerald-700' : 'text-brand-700'}
          ${!codePreview ? 'text-surface-300 italic text-sm font-normal' : ''}`}>
          {codePreview || 'Complete los campos de código...'}
        </div>
        {codeStatus === 'duplicate' && (
          <p className="text-xs text-red-500 mt-1.5">
            Este código ya existe en el proyecto. Cambie los valores de los campos para generar uno único.
          </p>
        )}
      </div>

      {/* ── Code fields ─────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-widest mb-3">
          Campos de codificación
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {codeFields.map(renderField)}
        </div>
      </div>

      {/* ── Basic info ──────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-widest mb-3">
          Información del entregable
        </h3>
        <div className="space-y-4">
          <div>
            <label className="label">Nombre del entregable <span className="text-red-500">*</span></label>
            <input type="text" className="input"
              placeholder="Ej: Plano de Arquitectura - Planta General Bloque A"
              {...register('name', { required: 'El nombre es obligatorio.' })} />
            {errors.name && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <AlertCircle size={10} /> {errors.name.message}
              </p>
            )}
          </div>

          <div>
            <label className="label">Descripción</label>
            <textarea className="input resize-none" rows={2}
              placeholder="Descripción breve del entregable..."
              {...register('description')} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Estado</label>
              <select className="select" {...register('status')}>
                {STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Responsable</label>
              <select className="select" {...register('assigned_to')}>
                <option value="">Sin asignar</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.full_name} ({u.specialty || u.role})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Fecha planificada</label>
              <input type="date" className="input" {...register('planned_date')} />
            </div>
          </div>

          {initial && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Fecha real de entrega</label>
                <input type="date" className="input" {...register('actual_date')} />
              </div>
              <div>
                <label className="label">Nota de cambio</label>
                <input type="text" className="input"
                  placeholder="Motivo de la modificación..."
                  {...register('change_note')} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Extra metadata fields ───────────────────────────────────────── */}
      {metaFields.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-widest mb-3">
            Campos adicionales
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {metaFields.map(renderField)}
          </div>
        </div>
      )}

      {/* ── Submit ──────────────────────────────────────────────────────── */}
      <div className="flex gap-3 justify-end pt-2 border-t border-surface-100">
        <button type="submit"
          disabled={isSubmitting || codeStatus === 'duplicate'}
          className="btn-primary min-w-[120px] justify-center">
          {isSubmitting
            ? <><Loader2 size={14} className="animate-spin" /> Guardando...</>
            : initial ? 'Actualizar entregable' : 'Crear entregable'
          }
        </button>
      </div>
    </form>
  );
}
