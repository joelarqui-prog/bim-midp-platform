import { AlertCircle, CheckCircle2, Clock, Eye, XCircle, Send,
         Loader2, Building2, FileText } from 'lucide-react';

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending:     { label: 'Pendiente',    icon: Clock,         cls: 'badge-pending' },
  in_progress: { label: 'En Progreso',  icon: Loader2,       cls: 'badge-in_progress' },
  for_review:  { label: 'En Revisión',  icon: Eye,           cls: 'badge-for_review' },
  approved:    { label: 'Aprobado',     icon: CheckCircle2,  cls: 'badge-approved' },
  rejected:    { label: 'Rechazado',    icon: XCircle,       cls: 'badge-rejected' },
  issued:      { label: 'Emitido',      icon: Send,          cls: 'badge-issued' },
};

export function StatusBadge({ status, showIcon = true }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={cfg.cls}>
      {showIcon && <Icon size={10} className="shrink-0" />}
      {cfg.label}
    </span>
  );
}

export const STATUS_OPTIONS = Object.entries(STATUS_CONFIG).map(([value, cfg]) => ({
  value, label: cfg.label,
}));

// ─── ROLE BADGE ───────────────────────────────────────────────────────────────
const ROLE_CONFIG = {
  admin:       { label: 'Administrador', cls: 'role-admin' },
  bim_manager: { label: 'BIM Manager',   cls: 'role-bim_manager' },
  specialist:  { label: 'Especialista',  cls: 'role-specialist' },
};

export function RoleBadge({ role }) {
  const cfg = ROLE_CONFIG[role] || ROLE_CONFIG.specialist;
  return <span className={cfg.cls}>{cfg.label}</span>;
}

// ─── CODE CHIP ────────────────────────────────────────────────────────────────
export function CodeChip({ code }) {
  return <span className="code-chip">{code}</span>;
}

// ─── EMPTY STATE ──────────────────────────────────────────────────────────────
export function EmptyState({ icon: Icon = FileText, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-surface-100 flex items-center justify-center mb-4">
        <Icon size={24} className="text-surface-400" />
      </div>
      <h3 className="font-display font-semibold text-surface-700 mb-1">{title}</h3>
      {description && <p className="text-sm text-surface-400 max-w-xs mb-4">{description}</p>}
      {action}
    </div>
  );
}

// ─── STAT CARD ────────────────────────────────────────────────────────────────
export function StatCard({ label, value, sub, icon: Icon, color = 'brand', trend }) {
  const colors = {
    brand:   'bg-brand-50 text-brand-600',
    green:   'bg-emerald-50 text-emerald-600',
    amber:   'bg-amber-50 text-amber-600',
    red:     'bg-red-50 text-red-600',
    violet:  'bg-violet-50 text-violet-600',
    slate:   'bg-slate-50 text-slate-600',
  };
  return (
    <div className="card p-5 flex items-start gap-4">
      {Icon && (
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colors[color]}`}>
          <Icon size={20} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide truncate">{label}</p>
        <p className="text-2xl font-display font-bold text-surface-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-surface-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── LOADING SPINNER ──────────────────────────────────────────────────────────
export function Spinner({ size = 20, className = '' }) {
  return <Loader2 size={size} className={`animate-spin text-brand-500 ${className}`} />;
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <Spinner size={32} />
    </div>
  );
}

// ─── CONFIRMATION MODAL ───────────────────────────────────────────────────────
export function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, danger = false }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative card p-6 w-full max-w-md mx-4 animate-fadeIn">
        <h3 className="font-display font-semibold text-surface-900 mb-2">{title}</h3>
        <p className="text-sm text-surface-600 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button className="btn-secondary" onClick={onCancel}>Cancelar</button>
          <button
            className={danger ? 'btn-danger' : 'btn-primary'}
            onClick={onConfirm}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL WRAPPER ────────────────────────────────────────────────────────────
export function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  if (!isOpen) return null;
  const sizes = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative card w-full ${sizes[size]} animate-fadeIn max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between p-5 border-b border-surface-200 shrink-0">
          <h2 className="font-display font-semibold text-surface-900">{title}</h2>
          <button className="btn-ghost p-1.5" onClick={onClose}>✕</button>
        </div>
        <div className="overflow-y-auto flex-1 scrollbar-thin">
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── FIELD TYPE LABEL ─────────────────────────────────────────────────────────
const FIELD_TYPE_LABELS = {
  text: 'Texto libre',
  dropdown: 'Lista desplegable',
  number: 'Número',
  date: 'Fecha',
  boolean: 'Verdadero/Falso',
};
export function FieldTypeLabel({ type }) {
  return <span className="text-surface-500 text-xs">{FIELD_TYPE_LABELS[type] || type}</span>;
}

// ─── PROGRESS RING ────────────────────────────────────────────────────────────
export function ProgressRing({ pct, size = 56, stroke = 5 }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#2979ff';

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none"
        stroke="#e2e8f0" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
    </svg>
  );
}
