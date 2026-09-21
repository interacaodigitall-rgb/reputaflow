import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  AlertTriangle,
  Star,
  Settings,
  ShieldAlert,
  Building,
  ExternalLink,
  ChevronDown,
  LogOut,
  QrCode,
  UserCheck
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { BrandLogo } from './BrandLogo';
import { PWAInstallButton } from './PWAInstallButton';

interface SidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  pendingCasesCount: number;
  onOpenQrModal: () => void;
  onOpenReviewPreview: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  pendingCasesCount,
  onOpenQrModal,
  onOpenReviewPreview
}) => {
  const {
    currentRole,
    setCurrentRole,
    businesses,
    selectedBusiness,
    setSelectedBusiness,
    currentUser,
    signInWithGoogle,
    signOut,
    isSuperAdmin
  } = useAuth();

  const [avatarError, setAvatarError] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'crm', label: 'CRM de Clientes', icon: Users },
    {
      id: 'recovery',
      label: 'Casos de Recuperação',
      icon: AlertTriangle,
      badge: pendingCasesCount > 0 ? pendingCasesCount : undefined
    },
    { id: 'reviews', label: 'Avaliações', icon: Star },
    { id: 'settings', label: 'Configurações & QR Code', icon: Settings }
  ];

  return (
    <aside className="hidden lg:flex flex-col w-64 bg-slate-900 text-slate-300 border-r border-slate-800 shrink-0 h-screen sticky top-0 justify-between select-none">
      {/* Brand & Establishment Switcher */}
      <div className="p-5 space-y-5">
        {/* Brand Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandLogo size="md" variant="dark" />
            <div className="flex flex-col">
              <span className="font-extrabold text-white text-base tracking-tight font-heading leading-none">
                Reputa<span className="text-indigo-400">Flow</span>
              </span>
              <span className="block text-[8px] uppercase tracking-widest text-slate-400 font-bold mt-0.5">
                SaaS Multiempresa
              </span>
            </div>
          </div>
          <PWAInstallButton />
        </div>

        {/* Business Selector or Merchant Badge */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            {isSuperAdmin ? 'Estabelecimento Ativo' : 'O Seu Comércio'}
          </label>
          {isSuperAdmin ? (
            <div className="relative">
              <select
                value={selectedBusiness?.id || ''}
                onChange={(e) => {
                  const b = businesses.find((item) => item.id === e.target.value);
                  if (b) setSelectedBusiness(b);
                }}
                className="w-full text-xs font-semibold py-2 px-2.5 bg-slate-800 text-white rounded-xl border border-slate-700 outline-none focus:ring-1 focus:ring-indigo-500 truncate pr-6 cursor-pointer"
              >
                {businesses.map((biz) => (
                  <option key={biz.id} value={biz.id}>
                    {biz.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="py-2 px-3 bg-slate-800/90 text-white rounded-xl border border-slate-700/80 text-xs font-bold truncate flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 truncate min-w-0">
                {selectedBusiness?.logoUrl && (
                  <img
                    src={selectedBusiness.logoUrl}
                    alt={selectedBusiness.name}
                    className="w-6 h-6 rounded-lg object-cover shrink-0 border border-slate-600"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                )}
                <span className="truncate">{selectedBusiness?.name || 'A carregar comércio...'}</span>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 ml-1 animate-pulse"></span>
            </div>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-900/50'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          {/* Super Admin Special Entry (ONLY visible to Super Admin) */}
          {isSuperAdmin && (
            <div className="pt-3 border-t border-slate-800/80">
              <button
                onClick={() => onSelectTab('super_admin')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                  activeTab === 'super_admin'
                    ? 'bg-rose-600 text-white shadow-sm shadow-rose-900/50'
                    : 'text-rose-300 hover:text-white hover:bg-rose-950/40 border border-rose-500/20'
                }`}
              >
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span>Painel Super Admin</span>
              </button>
            </div>
          )}
        </nav>
      </div>

      {/* Footer Role Toggles & User Info */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/40 space-y-3">
        {/* Quick Review Page Launch */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onOpenQrModal}
            className="flex items-center justify-center gap-1.5 py-2 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition"
            title="Ver QR Code"
          >
            <QrCode className="w-3.5 h-3.5 text-indigo-400" />
            <span>QR Code</span>
          </button>

          <button
            onClick={onOpenReviewPreview}
            className="flex items-center justify-center gap-1.5 py-2 px-2.5 bg-indigo-950 hover:bg-indigo-900 text-indigo-200 text-xs font-semibold rounded-xl border border-indigo-800 transition"
            title="Abrir página pública como cliente"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Página Cliente</span>
          </button>
        </div>

        {/* User Card */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 text-white font-bold text-xs">
              {currentUser?.photoURL && !avatarError ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName || 'Avatar'}
                  onError={() => setAvatarError(true)}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full bg-indigo-600 flex items-center justify-center text-white font-bold">
                  {currentUser?.email ? currentUser.email[0].toUpperCase() : 'R'}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">
                {currentUser?.displayName || (currentRole === 'super_admin' ? 'Super Admin' : 'Comerciante')}
              </p>
              <p className="text-[10px] text-slate-400 truncate">
                {currentUser?.email || (currentRole === 'super_admin' ? 'interacaodigitall@gmail.com' : 'comerciante@reputaflow.com')}
              </p>
            </div>
          </div>

          {currentUser ? (
            <button
              onClick={signOut}
              title="Encerrar Sessão"
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={signInWithGoogle}
              className="text-[11px] font-bold text-indigo-400 hover:underline"
            >
              Entrar
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
