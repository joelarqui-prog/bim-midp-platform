import { useQuery } from '@tanstack/react-query';
import {
  FileText, CheckCircle2, Clock, AlertCircle,
  TrendingUp, Users, BarChart3, Activity
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import { dashboardAPI } from '../utils/api';
import { useProjectStore } from '../hooks/useAuth';
import { StatCard, PageLoader, StatusBadge, ProgressRing } from '../components/shared';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const STATUS_COLORS = {
  pending: '#94a3b8', in_progress: '#3b82f6',
  for_review: '#f59e0b', approved: '#10b981',
  rejected: '#ef4444', issued: '#8b5cf6',
};
const STATUS_LABELS = {
  pending: 'Pendiente', in_progress: 'En Progreso',
  for_review: 'En Revisión', approved: 'Aprobado',
  rejected: 'Rechazado', issued: 'Emitido',
};

export default function DashboardPage() {
  const { currentProject } = useProjectStore();
  const projectId = currentProject?.id;

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', projectId],
    queryFn: () => dashboardAPI.get(projectId).then(r => r.data),
    enabled: !!projectId,
    refetchInterval: 60_000,
  });

  if (!projectId) {
    return (
      <div className="p-8 text-center">
        <div className="card max-w-md mx-auto p-12">
          <BarChart3 size={40} className="text-surface-300 mx-auto mb-4" />
          <h2 className="font-display font-semibold text-surface-700 mb-2">Seleccione un proyecto</h2>
          <p className="text-sm text-surface-400">Acceda a Administración → Proyectos para seleccionar el proyecto activo.</p>
        </div>
      </div>
    );
  }

  if (isLoading) return <PageLoader />;

  const { summary, status_distribution = [], discipline_progress = [], recent_activity = [], user_load = [] } = data || {};

  const pieData = status_distribution.map(s => ({
    name: STATUS_LABELS[s.status] || s.status,
    value: parseInt(s.count),
    color: STATUS_COLORS[s.status] || '#94a3b8',
  }));

  const barData = discipline_progress.map(d => ({
    discipline: d.discipline || 'Sin disciplina',
    total: parseInt(d.total),
    completados: parseInt(d.completed),
    pendientes: parseInt(d.total) - parseInt(d.completed),
  }));

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="font-display font-bold text-2xl text-surface-900">Dashboard</h1>
        <p className="text-sm text-surface-400 mt-0.5">
          {currentProject?.name} · MIDP BIM · ISO 19650
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total entregables" value={summary?.total_deliverables ?? 0}
          icon={FileText} color="brand"
          sub="registrados en el proyecto" />
        <StatCard label="Completados" value={summary?.completed ?? 0}
          icon={CheckCircle2} color="green"
          sub={`${summary?.completion_pct ?? 0}% del total`} />
        <StatCard label="En proceso" value={status_distribution.find(s=>s.status==='in_progress')?.count ?? 0}
          icon={Activity} color="amber"
          sub="en_progreso + revisión" />
        <StatCard label="Pendientes" value={status_distribution.find(s=>s.status==='pending')?.count ?? 0}
          icon={Clock} color="slate"
          sub="sin iniciar" />
      </div>

      {/* Progress ring + bar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Overall progress */}
        <div className="card p-5 flex flex-col items-center justify-center">
          <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-4">
            Avance general
          </p>
          <div className="relative">
            <ProgressRing pct={summary?.completion_pct ?? 0} size={120} stroke={10} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-display font-bold text-2xl text-surface-900">
                {summary?.completion_pct ?? 0}%
              </span>
            </div>
          </div>
          <p className="text-xs text-surface-400 mt-4 text-center">
            {summary?.completed} de {summary?.total_deliverables} entregables completados
          </p>
        </div>

        {/* Discipline progress bar */}
        <div className="card p-5 lg:col-span-2">
          <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-4">
            Avance por disciplina
          </p>
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={barData} barSize={14} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="discipline" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                />
                <Bar dataKey="completados" fill="#10b981" radius={[3,3,0,0]} name="Completados" />
                <Bar dataKey="pendientes" fill="#e2e8f0" radius={[3,3,0,0]} name="Pendientes" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-40 text-surface-300 text-sm">
              Sin datos de disciplina disponibles
            </div>
          )}
        </div>
      </div>

      {/* Status pie + recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Status distribution */}
        <div className="card p-5">
          <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-4">
            Distribución por estado
          </p>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                  dataKey="value" paddingAngle={2}>
                  {pieData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend iconType="circle" iconSize={8}
                  formatter={v => <span style={{ fontSize: 11 }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-40 text-surface-300 text-sm">
              Sin entregables registrados
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="card p-5">
          <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-4">
            Actividad reciente
          </p>
          <div className="space-y-3">
            {recent_activity.length > 0 ? recent_activity.slice(0,8).map((log, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-brand-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[10px] font-bold text-brand-600">
                    {log.user_name?.charAt(0).toUpperCase() || '?'}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-surface-700">
                    <span className="font-semibold">{log.user_name || 'Sistema'}</span>
                    {' '}{log.action === 'create' ? 'creó' :
                          log.action === 'update' ? 'actualizó' :
                          log.action === 'import' ? 'importó' :
                          log.action === 'delete' ? 'eliminó' : log.action}
                    {' '}<span className="text-surface-500">{log.entity_type}</span>
                  </p>
                  <p className="text-[10px] text-surface-400">
                    {format(new Date(log.created_at), "d MMM yyyy, HH:mm", { locale: es })}
                  </p>
                </div>
              </div>
            )) : (
              <p className="text-sm text-surface-300 text-center py-8">Sin actividad reciente</p>
            )}
          </div>
        </div>
      </div>

      {/* User workload */}
      {user_load.length > 0 && (
        <div className="card p-5">
          <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-4">
            Carga de trabajo por usuario
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {user_load.map((u, i) => (
              <div key={i} className="bg-surface-50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-brand-600">
                      {u.full_name?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-surface-700 truncate">{u.full_name}</p>
                    <p className="text-[10px] text-surface-400 truncate">{u.specialty || '—'}</p>
                  </div>
                </div>
                <p className="text-xl font-display font-bold text-surface-900">{u.count}</p>
                <p className="text-[10px] text-surface-400">entregables asignados</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
