import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  AlertTriangle,
  Star,
  Settings,
  ShieldAlert,
  ExternalLink,
  LogOut,
  QrCode
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { BrandLogo, BrandWordmark, BRAND_ICON_URL } from './BrandLogo';
import { BusinessLogo } from './BusinessLogo';
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
    <aside className="hidden lg:flex flex-col w-64 bg-white text-gray-700 border-r border-gray-200 shrink-0 h-screen sticky top-0 justify-between select-none shadow-2xs">
      {/* Top Google 4-color accent bar */}
      <div>
        <div className="h-1 w-full google-color-bar" />

        {/* Brand & Establishment Switcher */}
        <div className="p-5 space-y-5">
          {/* Brand Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BrandLogo size="md" variant="light" />
              <div className="flex flex-col">
                <BrandWordmark className="text-base" />
                <span className="block text-[9px] uppercase tracking-widest text-gray-400 font-bold mt-0.5">
                  SaaS Multiempresa
                </span>
              </div>
            </div>
            <PWAInstallButton />
          </div>

          {/* Business Selector or Merchant Badge */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">
              {isSuperAdmin ? 'Estabelecimento Ativo' : 'O Seu Comércio'}
            </label>
            {isSuperAdmin ? (
              businesses.length > 0 ? (
                <div className="relative">
                  <select
                    value={selectedBusiness?.id || ''}
                    onChange={(e) => {
                      const b = businesses.find((item) => item.id === e.target.value);
                      if (b) setSelectedBusiness(b);
                    }}
                    className="w-full text-xs font-semibold py-2 px-3 bg-gray-50 hover:bg-gray-100/80 text-gray-900 rounded-lg border border-gray-300 outline-none focus:border-[#4285F4] focus:ring-2 focus:ring-[#4285F4]/20 truncate pr-6 cursor-pointer transition"
                  >
                    {businesses.map((biz) => (
                      <option key={biz.id} value={biz.id}>
                        {biz.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="py-2 px-3 bg-gray-50 text-gray-400 rounded-lg border border-gray-200 text-xs font-medium">
                  Nenhum comércio cadastrado
                </div>
              )
            ) : (
              <div className="py-2 px-3 bg-gray-50 text-gray-900 rounded-lg border border-gray-200 text-xs font-bold truncate flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 truncate min-w-0">
                  <BusinessLogo
                    url={selectedBusiness?.logoUrl}
                    name={selectedBusiness?.name || 'Comércio'}
                    size="xs"
                    rounded="rounded-md"
                  />
                  <span className="truncate">{selectedBusiness?.name || 'Aguardando Comércio'}</span>
                </div>
                <span className="w-2 h-2 rounded-full bg-[#34A853] shrink-0 ml-1 animate-pulse"></span>
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
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    isActive
                      ? 'bg-[#4285F4]/10 text-[#1A73E8] font-bold border border-[#4285F4]/20'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/80'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-[#4285F4]' : 'text-gray-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#FBBC05] text-gray-900">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Super Admin Special Entry (ONLY visible to Super Admin) */}
            {isSuperAdmin && (
              <div className="pt-3 border-t border-gray-200/80">
                <button
                  onClick={() => onSelectTab('super_admin')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    activeTab === 'super_admin'
                      ? 'bg-[#EA4335] text-white shadow-xs'
                      : 'text-[#EA4335] hover:bg-[#EA4335]/10 border border-[#EA4335]/25'
                  }`}
                >
                  <ShieldAlert className={`w-4 h-4 ${activeTab === 'super_admin' ? 'text-white' : 'text-[#EA4335]'}`} />
                  <span>Painel Super Admin</span>
                </button>
              </div>
            )}
          </nav>
        </div>
      </div>

      {/* Footer Role Toggles & User Info */}
      <div className="p-4 border-t border-gray-200 bg-gray-50/60 space-y-3">
        {/* Quick Review Page Launch */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onOpenQrModal}
            className="flex items-center justify-center gap-1.5 py-2 px-2.5 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-lg border border-gray-300 shadow-2xs transition cursor-pointer"
            title="Ver QR Code"
          >
            <QrCode className="w-3.5 h-3.5 text-[#4285F4]" />
            <span>QR Code</span>
          </button>

          <button
            onClick={onOpenReviewPreview}
            className="flex items-center justify-center gap-1.5 py-2 px-2.5 bg-[#4285F4] hover:bg-[#3367D6] text-white text-xs font-semibold rounded-lg shadow-2xs transition cursor-pointer"
            title="Abrir página pública como cliente"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Página Cliente</span>
          </button>
        </div>

        {/* User Card */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-white border border-gray-200 flex items-center justify-center shrink-0">
              {currentUser?.photoURL && !avatarError ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName || 'Avatar'}
                  onError={() => setAvatarError(true)}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <img
                  src={BRAND_ICON_URL}
                  alt="GlowfyHub Avatar"
                  className="w-full h-full object-contain p-0.5"
                />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-gray-900 truncate">
                {currentUser?.displayName || (currentRole === 'super_admin' ? 'Super Admin' : 'Comerciante')}
              </p>
              <p className="text-[10px] text-gray-500 truncate">
                {currentUser?.email || (currentRole === 'super_admin' ? 'interacaodigitall@gmail.com' : 'comerciante@glowfyhub.com')}
              </p>
            </div>
          </div>

          {currentUser ? (
            <button
              onClick={signOut}
              title="Encerrar Sessão"
              className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-200/60 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={signInWithGoogle}
              className="text-[11px] font-bold text-[#4285F4] hover:underline cursor-pointer"
            >
              Entrar
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
