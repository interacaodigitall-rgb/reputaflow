import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Menu,
  X,
  ShieldAlert,
  QrCode,
  ExternalLink,
  LogOut,
  LayoutDashboard,
  Users,
  AlertTriangle,
  Star,
  Settings
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { BrandLogo, BrandWordmark, BRAND_ICON_URL } from './BrandLogo';
import { BusinessLogo } from './BusinessLogo';
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
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between shadow-2xs">
        {/* Left: Mobile Hamburger & Brand & Business Selector */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Mobile Hamburger Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Abrir Menu de Navegação"
            className="lg:hidden p-2 text-gray-700 hover:text-gray-950 hover:bg-gray-100 rounded-lg transition min-w-[44px] min-h-[44px] flex items-center justify-center -ml-1"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex lg:hidden items-center gap-1.5">
            <BrandLogo size="sm" variant="light" />
            <BrandWordmark className="text-sm" />
          </div>

          {/* Business Selector (or Merchant Business Badge) */}
          <div className="flex items-center gap-2">
            {isSuperAdmin ? (
              businesses.length > 0 ? (
                <div className="relative">
                  <select
                    value={selectedBusiness?.id || ''}
                    onChange={(e) => {
                      const b = businesses.find((item) => item.id === e.target.value);
                      if (b) setSelectedBusiness(b);
                    }}
                    className="text-xs font-semibold py-2 px-3 bg-white hover:bg-gray-50 text-gray-800 rounded-lg border border-gray-300 outline-none focus:border-[#4285F4] focus:ring-2 focus:ring-[#4285F4]/20 cursor-pointer max-w-[150px] sm:max-w-[200px] truncate min-h-[38px] transition"
                  >
                    {businesses.map((biz) => (
                      <option key={biz.id} value={biz.id}>
                        {biz.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="py-1.5 px-3 bg-gray-50 text-gray-500 rounded-lg border border-gray-200 text-xs font-semibold">
                  Sem comércios
                </div>
              )
            ) : (
              <div className="py-1.5 px-2.5 sm:px-3 bg-gray-50 text-gray-900 rounded-lg border border-gray-200 text-xs font-bold truncate max-w-[140px] sm:max-w-[200px] flex items-center gap-1.5 min-h-[38px]">
                <BusinessLogo
                  url={selectedBusiness?.logoUrl}
                  name={selectedBusiness?.name || 'Comércio'}
                  size="xs"
                  rounded="rounded-md"
                />
                <span className="truncate">{selectedBusiness?.name || 'Aguardando Comércio'}</span>
              </div>
            )}

            {selectedBusiness?.googleReviewUrl && (
              <span className="hidden md:inline-flex items-center gap-1 text-[11px] font-semibold text-[#137333] bg-[#34A853]/10 px-2.5 py-0.5 rounded-full border border-[#34A853]/25">
                <span className="w-1.5 h-1.5 rounded-full bg-[#34A853]"></span>
                Google Conectado
              </span>
            )}
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          {/* PWA Install on Top Bar */}
          <PWAInstallButton />

          {/* Quick Review Test Button */}
          <button
            onClick={onOpenReviewPreview}
            className="flex items-center justify-center gap-1.5 py-2 px-2.5 sm:px-3.5 bg-[#4285F4]/10 hover:bg-[#4285F4]/15 text-[#1A73E8] border border-[#4285F4]/20 rounded-lg text-xs font-semibold transition min-h-[38px] cursor-pointer"
            title="Ver como cliente"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Página de Avaliação</span>
            <span className="sm:hidden">Avaliar</span>
          </button>

          {/* QR Code Quick Button */}
          <button
            onClick={onOpenQrModal}
            className="p-2 sm:py-2 sm:px-3 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 min-h-[38px] min-w-[38px] shadow-2xs cursor-pointer"
            title="Ver QR Code"
          >
            <QrCode className="w-4 h-4 text-[#4285F4]" />
            <span className="hidden sm:inline">QR Code</span>
          </button>

          {/* Super Admin Switch Shortcut (ONLY for Super Admin) */}
          {isSuperAdmin && (
            <button
              onClick={onNavigateToSuperAdmin}
              className="hidden sm:flex items-center gap-1.5 py-2 px-3 bg-[#EA4335]/10 hover:bg-[#EA4335]/15 text-[#C5221F] rounded-lg text-xs font-semibold border border-[#EA4335]/25 transition min-h-[38px] cursor-pointer"
              title="Super Admin"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-[#EA4335]" />
              <span>Super Admin</span>
            </button>
          )}

          {/* Auth status */}
          {currentUser ? (
            <div className="flex items-center gap-1.5 sm:gap-2 pl-1.5 sm:pl-2 border-l border-gray-200">
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
              <button
                onClick={signOut}
                title="Sair"
                className="p-2 text-gray-400 hover:text-gray-700 rounded-lg min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={signInWithGoogle}
              className="py-2 px-3.5 bg-[#4285F4] hover:bg-[#3367D6] text-white text-xs font-semibold rounded-lg transition shadow-xs min-h-[38px] cursor-pointer"
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
              className="fixed inset-0 bg-gray-900/50 backdrop-blur-xs"
            />

            {/* Drawer Sheet */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              className="relative w-4/5 max-w-xs bg-white text-gray-800 h-full shadow-2xl flex flex-col justify-between z-10 overflow-y-auto pb-6"
            >
              <div>
                <div className="h-1.5 w-full google-color-bar" />
                <div className="p-5 space-y-5">
                  {/* Header with Close Button */}
                  <div className="flex items-center justify-between border-b border-gray-200 pb-4">
                    <div className="flex items-center gap-3">
                      <BrandLogo size="md" variant="light" />
                      <div>
                        <BrandWordmark className="text-base block" />
                        <span className="text-[9px] uppercase tracking-wider text-gray-400 font-bold">
                          Gestão Multiempresa
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setMobileMenuOpen(false)}
                      className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Establishment Selection in Drawer */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                      {isSuperAdmin ? 'Estabelecimento Ativo' : 'O Seu Estabelecimento'}
                    </label>
                    {isSuperAdmin ? (
                      <select
                        value={selectedBusiness?.id || ''}
                        onChange={(e) => {
                          const b = businesses.find((item) => item.id === e.target.value);
                          if (b) setSelectedBusiness(b);
                        }}
                        className="w-full text-xs font-semibold py-2.5 px-3 bg-gray-50 text-gray-900 rounded-lg border border-gray-300 outline-none focus:border-[#4285F4] focus:ring-2 focus:ring-[#4285F4]/20 cursor-pointer min-h-[44px]"
                      >
                        {businesses.map((biz) => (
                          <option key={biz.id} value={biz.id}>
                            {biz.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="py-2.5 px-3 bg-gray-50 text-gray-900 rounded-lg border border-gray-200 text-xs font-bold flex items-center justify-between gap-2 min-h-[44px]">
                        <div className="flex items-center gap-2 truncate">
                          <BusinessLogo
                            url={selectedBusiness?.logoUrl}
                            name={selectedBusiness?.name}
                            size="xs"
                            rounded="rounded-md"
                          />
                          <span className="truncate">{selectedBusiness?.name || 'Comércio'}</span>
                        </div>
                        <span className="w-2 h-2 rounded-full bg-[#34A853] shrink-0"></span>
                      </div>
                    )}
                  </div>

                  {/* Main Navigation Links */}
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block px-1 mb-1">
                      Navegação Principal
                    </label>
                    {navItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleMobileNavClick(item.id)}
                          className={`w-full flex items-center justify-between px-3.5 py-3 rounded-lg text-xs font-semibold transition min-h-[44px] ${
                            isActive
                              ? 'bg-[#4285F4]/10 text-[#1A73E8] font-bold border border-[#4285F4]/20'
                              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Icon className={`w-4 h-4 ${isActive ? 'text-[#4285F4]' : 'text-gray-400'}`} />
                            <span>{item.label}</span>
                          </div>
                          {item.badge && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FBBC05] text-gray-900">
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
                        className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-lg text-xs font-bold transition min-h-[44px] mt-2 ${
                          activeTab === 'super_admin'
                            ? 'bg-[#EA4335] text-white shadow-xs'
                            : 'text-[#EA4335] hover:bg-[#EA4335]/10 border border-[#EA4335]/25'
                        }`}
                      >
                        <ShieldAlert className={`w-4 h-4 ${activeTab === 'super_admin' ? 'text-white' : 'text-[#EA4335]'}`} />
                        <span>Painel Super Admin</span>
                      </button>
                    )}
                  </div>

                  {/* Quick Actions */}
                  <div className="space-y-2 pt-2 border-t border-gray-200">
                    <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block px-1">
                      Ações Rápidas
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      <button
                        onClick={() => {
                          setMobileMenuOpen(false);
                          onOpenQrModal();
                        }}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 text-xs font-semibold rounded-lg transition min-h-[44px]"
                      >
                        <QrCode className="w-4 h-4 text-[#4285F4]" />
                        <span>Ver QR Code de Avaliação</span>
                      </button>

                      <button
                        onClick={() => {
                          setMobileMenuOpen(false);
                          onOpenReviewPreview();
                        }}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-[#4285F4] hover:bg-[#3367D6] text-white text-xs font-semibold rounded-lg shadow-xs transition min-h-[44px]"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>Testar Página do Cliente</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom User Area */}
              <div className="px-5 pt-3 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
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
                        {currentUser?.displayName || (isSuperAdmin ? 'Super Admin' : 'Comerciante')}
                      </p>
                      <p className="text-[10px] text-gray-500 truncate">
                        {currentUser?.email || (isSuperAdmin ? 'interacaodigitall@gmail.com' : 'comerciante@glowfyhub.com')}
                      </p>
                    </div>
                  </div>

                  {currentUser ? (
                    <button
                      onClick={signOut}
                      className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition min-h-[44px] min-w-[44px] flex items-center justify-center"
                      title="Sair"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={signInWithGoogle}
                      className="text-xs font-bold text-[#4285F4] hover:underline py-2 px-3"
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
