import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import {
  LayoutDashboard, FileText, Users, Settings, LogOut,
  ChevronDown, Building2, Upload, Download, History,
  BarChart3, Layers, Menu, X, ChevronRight, Bell
} from 'lucide-react';
import { useAuthStore, useProjectStore } from '../../hooks/useAuth';
import { RoleBadge } from '../shared';

const NAV_ITEMS = [
  {
    section: 'Principal',
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { href: '/deliverables', icon: FileText, label: 'Entregables' },
      { href: '/progress', icon: BarChart3, label: 'Avance' },
    ],
  },
  {
    section: 'Gestión',
    items: [
      { href: '/import', icon: Upload, label: 'Importar', roles: ['admin', 'bim_manager'] },
      { href: '/export', icon: Download, label: 'Exportar' },
      { href: '/audit', icon: History, label: 'Auditoría' },
    ],
  },
  {
    section: 'Administración',
    items: [
      { href: '/admin/schemas', icon: Layers, label: 'Campos', roles: ['admin'] },
      { href: '/admin/users', icon: Users, label: 'Usuarios', roles: ['admin'] },
      { href: '/admin/projects', icon: Building2, label: 'Proyectos', roles: ['admin'] },
    ],
  },
];

export default function Layout({ children }) {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { currentProject } = useProjectStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (href) => router.pathname.startsWith(href);
  const canView = (roles) => !roles || roles.includes(user?.role);

  return (
    <div className="flex h-screen bg-surface-50 overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-60 bg-white border-r border-surface-200
        flex flex-col transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:relative lg:translate-x-0 lg:flex
      `}>
        {/* Logo */}
        <div className="px-4 py-4 border-b border-surface-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
              <Layers size={16} className="text-white" />
            </div>
            <div>
              <p className="font-display font-bold text-surface-900 text-sm leading-none">MIDP</p>
              <p className="text-[10px] text-surface-400 font-mono uppercase tracking-wider">BIM Platform</p>
            </div>
          </div>
        </div>

        {/* Project selector */}
        {currentProject && (
          <div className="mx-3 mt-3 px-3 py-2 bg-brand-50 rounded-lg">
            <p className="text-[10px] font-semibold text-brand-500 uppercase tracking-wide">Proyecto activo</p>
            <p className="text-xs font-semibold text-brand-800 truncate mt-0.5">{currentProject.code}</p>
            <p className="text-[10px] text-brand-600 truncate">{currentProject.name}</p>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto scrollbar-thin">
          {NAV_ITEMS.map((section) => {
            const visibleItems = section.items.filter(i => canView(i.roles));
            if (!visibleItems.length) return null;
            return (
              <div key={section.section} className="mb-5">
                <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-widest px-3 mb-1.5">
                  {section.section}
                </p>
                {visibleItems.map((item) => (
                  <Link key={item.href} href={item.href}>
                    <div className={`sidebar-link ${isActive(item.href) ? 'active' : ''}`}>
                      <item.icon size={15} className="shrink-0" />
                      <span>{item.label}</span>
                      {isActive(item.href) && (
                        <ChevronRight size={12} className="ml-auto text-brand-400" />
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>

        {/* User section */}
        <div className="px-3 py-3 border-t border-surface-100">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-brand-600">
                {user?.full_name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-surface-800 truncate">{user?.full_name}</p>
              <RoleBadge role={user?.role} />
            </div>
          </div>
          <button
            onClick={logout}
            className="sidebar-link w-full mt-1 text-red-500 hover:bg-red-50 hover:text-red-600"
          >
            <LogOut size={15} />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-surface-200 px-4 py-3 flex items-center gap-3 shrink-0">
          <button
            className="lg:hidden btn-ghost p-1.5"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-sm text-surface-500 min-w-0">
            <span className="text-surface-400">ISO 19650</span>
            <ChevronRight size={12} />
            <span className="font-medium text-surface-700 truncate">
              {currentProject?.name || 'Seleccione un proyecto'}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button className="btn-ghost p-1.5 relative">
              <Bell size={16} />
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-brand-500 rounded-full" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="animate-fadeIn">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
