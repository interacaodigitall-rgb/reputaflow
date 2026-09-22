import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Menu,
  X,
  ShieldAlert,
  Building,
  QrCode,
  ExternalLink,
  User,
  LogOut,
  ChevronDown,
  LayoutDashboard,
  Users,
  AlertTriangle,
  Star,
  Settings,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { BrandLogo } from './BrandLogo';
import { PWAInstallButton } from './PWAInstallButton';

interface HeaderProps {
  activeTab?: string;
  onSelectTab?: (tab: string) => void;
  pendingCasesCount?: number;
  onOpenQrModal: () => void;
  onOpenReviewPreview: () => void;
  onNavigateToSuperAdmin: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  pendingCasesCount = 0,
  onOpenQrModal,
  onOpenReviewPreview,
  onNavigateToSuperAdmin
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard / Painel', icon: LayoutDashboard },
    { id: 'crm', label: 'CRM de Clientes', icon: Users },
    {
      id: 'recovery',
      label: 'Casos de Recuperação',
      icon: AlertTriangle,
      badge: pendingCasesCount > 0 ? pendingCasesCount : undefined
    },
    { id: 'reviews', label: 'Avaliações Recebidas', icon: Star },
    { id: 'settings', label: 'Configurações & QR Code', icon: Settings }
  ];

  const handleMobileNavClick = (tabId: string) => {
    if (onSelectTab) {
      onSelectTab(tabId);
    }
    setMobileMenuOpen(false);
  };

  return (
    <>
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-30 px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between">
        {/* Left: Mobile Hamburger & Brand & Business Selector */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Mobile Hamburger Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Abrir Menu de Navegação"
            className="lg:hidden p-2 text-slate-700 hover:text-slate-950 hover:bg-slate-100 rounded-xl transition min-w-[44px] min-h-[44px] flex items-center justify-center -ml-1"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex lg:hidden items-center gap-1.5">
            <BrandLogo size="sm" variant="light" />
            <span className="font-extrabold text-slate-900 text-sm tracking-tight font-heading">
              Reputa<span className="text-indigo-600">Flow</span>
            </span>
          </div>

          {/* Business Selector (or Merchant Business Badge) */}
          <div className="flex items-center gap-2">
            {isSuperAdmin ? (
              <div className="relative">
                <select
                  value={selectedBusiness?.id || ''}
                  onChange={(e) => {
                    const b = businesses.find((item) => item.id === e.target.value);
                    if (b) setSelectedBusiness(b);
                  }}
                  className="text-xs font-bold py-2 px-3 bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-xl border border-slate-200 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer max-w-[150px] sm:max-w-[200px] truncate min-h-[38px]"
                >
                  {businesses.map((biz) => (
                    <option key={biz.id} value={biz.id}>
                      {biz.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="py-1.5 px-2.5 sm:px-3 bg-slate-100 text-slate-900 rounded-xl border border-slate-200 text-xs font-bold truncate max-w-[140px] sm:max-w-[200px] flex items-center gap-1.5 min-h-[38px]">
                {selectedBusiness?.logoUrl && (
                  <img
                    src={selectedBusiness.logoUrl}
                    alt={selectedBusiness.name}
                    className="w-4 h-4 rounded-md object-cover shrink-0"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                )}
                <span className="truncate">{selectedBusiness?.name || 'A carregar...'}</span>
              </div>
            )}

            {selectedBusiness?.googleReviewUrl && (
              <span className="hidden md:inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Google Conectado
              </span>
            )}
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-1.5 sm:gap-3">
          {/* PWA Install on Top Bar */}
          <PWAInstallButton />

          {/* Quick Review Test Button */}
          <button
            onClick={onOpenReviewPreview}
            className="flex items-center justify-center gap-1.5 py-2 px-2.5 sm:px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition min-h-[40px]"
            title="Ver como cliente"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Página de Avaliação</span>
            <span className="sm:hidden">Avaliar</span>
          </button>

          {/* QR Code Quick Button */}
          <button
            onClick={onOpenQrModal}
            className="p-2 sm:py-2 sm:px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 min-h-[40px] min-w-[40px]"
            title="Ver QR Code"
          >
            <QrCode className="w-4 h-4 text-indigo-600" />
            <span className="hidden sm:inline">QR Code</span>
          </button>

          {/* Super Admin Switch Shortcut (ONLY for Super Admin) */}
          {isSuperAdmin && (
            <button
              onClick={onNavigateToSuperAdmin}
              className="hidden sm:flex items-center gap-1.5 py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold border border-rose-200/60 transition min-h-[40px]"
              title="Super Admin"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
              <span>Super Admin</span>
            </button>
          )}

          {/* Auth status */}
          {currentUser ? (
            <div className="flex items-center gap-1.5 sm:gap-2 pl-1.5 sm:pl-2 border-l border-slate-200">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
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
                    src="https://i.postimg.cc/2ScRmDwy/logo-02-png.png"
                    alt="ReputaFlow Avatar"
                    className="w-full h-full object-cover p-0.5"
                    referrerPolicy="no-referrer"
                  />
                )}
              </div>
              <button
                onClick={signOut}
                title="Sair"
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg min-w-[36px] min-h-[36px] flex items-center justify-center"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={signInWithGoogle}
              className="py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition shadow-xs min-h-[40px]"
            >
              Entrar
            </button>
          )}
        </div>
      </header>

      {/* Mobile Drawer Navigation Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            />

            {/* Drawer Sheet */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              className="relative w-4/5 max-w-xs bg-slate-900 text-slate-200 h-full shadow-2xl flex flex-col justify-between z-10 overflow-y-auto pb-6"
            >
              <div className="p-5 space-y-5">
                {/* Header with Close Button */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-3">
                    <BrandLogo size="md" variant="dark" />
                    <div>
                      <span className="font-extrabold text-white text-base tracking-tight font-heading block">
                        Reputa<span className="text-indigo-400">Flow</span>
                      </span>
                      <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">
                        Gestão Multiempresa
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Establishment Selection in Drawer */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    {isSuperAdmin ? 'Estabelecimento Ativo' : 'O Seu Estabelecimento'}
                  </label>
                  {isSuperAdmin ? (
                    <select
                      value={selectedBusiness?.id || ''}
                      onChange={(e) => {
                        const b = businesses.find((item) => item.id === e.target.value);
                        if (b) setSelectedBusiness(b);
                      }}
                      className="w-full text-xs font-semibold py-2.5 px-3 bg-slate-800 text-white rounded-xl border border-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer min-h-[44px]"
                    >
                      {businesses.map((biz) => (
                        <option key={biz.id} value={biz.id}>
                          {biz.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="py-2.5 px-3 bg-slate-800 text-white rounded-xl border border-slate-700 text-xs font-bold flex items-center justify-between gap-2 min-h-[44px]">
                      <div className="flex items-center gap-2 truncate">
                        {selectedBusiness?.logoUrl && (
                          <img
                            src={selectedBusiness.logoUrl}
                            alt={selectedBusiness.name}
                            className="w-5 h-5 rounded-md object-cover shrink-0"
                            referrerPolicy="no-referrer"
                          />
                        )}
                        <span className="truncate">{selectedBusiness?.name || 'Comércio'}</span>
                      </div>
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
                    </div>
                  )}
                </div>

                {/* Main Navigation Links */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block px-1 mb-1">
                    Navegação Principal
                  </label>
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleMobileNavClick(item.id)}
                        className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-semibold transition min-h-[44px] ${
                          isActive
                            ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-950'
                            : 'text-slate-300 hover:text-white hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                          <span>{item.label}</span>
                        </div>
                        {item.badge && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}

                  {isSuperAdmin && (
                    <button
                      onClick={() => {
                        onNavigateToSuperAdmin();
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-xs font-bold transition min-h-[44px] mt-2 ${
                        activeTab === 'super_admin'
                          ? 'bg-rose-600 text-white shadow-md'
                          : 'text-rose-300 hover:text-white hover:bg-rose-950/60 border border-rose-500/30'
                      }`}
                    >
                      <ShieldAlert className="w-4 h-4 text-rose-400" />
                      <span>Painel Super Admin</span>
                    </button>
                  )}
                </div>

                {/* Quick Actions */}
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block px-1">
                    Ações Rápidas
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onOpenQrModal();
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition min-h-[44px]"
                    >
                      <QrCode className="w-4 h-4 text-indigo-400" />
                      <span>Ver QR Code de Avaliação</span>
                    </button>

                    <button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onOpenReviewPreview();
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-indigo-950 hover:bg-indigo-900 text-indigo-200 text-xs font-semibold rounded-xl border border-indigo-800/80 transition min-h-[44px]"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Testar Página do Cliente</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Bottom User Area */}
              <div className="px-5 pt-3 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
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
                          src="https://i.postimg.cc/2ScRmDwy/logo-02-png.png"
                          alt="ReputaFlow Avatar"
                          className="w-full h-full object-cover p-0.5"
                          referrerPolicy="no-referrer"
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">
                        {currentUser?.displayName || (isSuperAdmin ? 'Super Admin' : 'Comerciante')}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {currentUser?.email || (isSuperAdmin ? 'interacaodigitall@gmail.com' : 'comerciante@reputaflow.com')}
                      </p>
                    </div>
                  </div>

                  {currentUser ? (
                    <button
                      onClick={signOut}
                      className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition min-h-[44px] min-w-[44px] flex items-center justify-center"
                      title="Sair"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={signInWithGoogle}
                      className="text-xs font-bold text-indigo-400 hover:underline py-2 px-3"
                    >
                      Entrar
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

