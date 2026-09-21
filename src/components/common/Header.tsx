import React from 'react';
import {
  Menu,
  ShieldAlert,
  Building,
  QrCode,
  ExternalLink,
  User,
  LogOut,
  ChevronDown
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface HeaderProps {
  onOpenQrModal: () => void;
  onOpenReviewPreview: () => void;
  onNavigateToSuperAdmin: () => void;
}

export const Header: React.FC<HeaderProps> = ({
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

  return (
    <header className="bg-white border-b border-slate-200/80 sticky top-0 z-30 px-4 sm:px-6 py-3 flex items-center justify-between">
      {/* Left: Mobile Brand & Business Selector */}
      <div className="flex items-center gap-3">
        <div className="flex lg:hidden items-center gap-2">
          <img
            src="https://i.postimg.cc/Y974HYRZ/logo-png.png"
            alt="ReputaFlow Logo"
            className="h-10 w-auto object-contain"
            style={{ mixBlendMode: 'multiply' }}
            referrerPolicy="no-referrer"
          />
          <span className="font-extrabold text-slate-900 text-sm tracking-tight font-heading">
            Reputa<span className="text-indigo-600">Flow</span>
          </span>
        </div>

        {/* Business Selector (Mobile & Top status) */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={selectedBusiness?.id || ''}
              onChange={(e) => {
                const b = businesses.find((item) => item.id === e.target.value);
                if (b) setSelectedBusiness(b);
              }}
              className="text-xs font-bold py-1.5 px-3 bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-xl border border-slate-200 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer max-w-[200px] truncate"
            >
              {businesses.map((biz) => (
                <option key={biz.id} value={biz.id}>
                  {biz.name}
                </option>
              ))}
            </select>
          </div>

          {selectedBusiness?.googleReviewUrl && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Google Conectado
            </span>
          )}
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Quick Review Test Button */}
        <button
          onClick={onOpenReviewPreview}
          className="flex items-center gap-1.5 py-1.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition"
          title="Ver como cliente"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Página de Avaliação</span>
          <span className="sm:hidden">Avaliar</span>
        </button>

        {/* QR Code Quick Button */}
        <button
          onClick={onOpenQrModal}
          className="p-1.5 sm:py-1.5 sm:px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
          title="Ver QR Code"
        >
          <QrCode className="w-3.5 h-3.5 text-indigo-600" />
          <span className="hidden sm:inline">QR Code</span>
        </button>

        {/* Super Admin Switch Shortcut (For Evaluation & Multi-role testing) */}
        <button
          onClick={onNavigateToSuperAdmin}
          className="hidden sm:flex items-center gap-1.5 py-1.5 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold border border-rose-200/60 transition"
          title="Super Admin"
        >
          <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
          <span>Super Admin</span>
        </button>

        {/* Auth status */}
        {currentUser ? (
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-xs">
              {currentUser.displayName?.slice(0, 1) || currentUser.email?.slice(0, 1) || 'U'}
            </div>
            <button
              onClick={signOut}
              title="Sair"
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={signInWithGoogle}
            className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition shadow-xs"
          >
            Login Google
          </button>
        )}
      </div>
    </header>
  );
};
