import React from 'react';
import { LayoutDashboard, Users, AlertTriangle, Star, Settings } from 'lucide-react';

interface BottomNavProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  pendingCasesCount: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelectTab,
  pendingCasesCount
}) => {
  const items = [
    { id: 'dashboard', label: 'Painel', icon: LayoutDashboard },
    { id: 'crm', label: 'Clientes', icon: Users },
    {
      id: 'recovery',
      label: 'Recuperar',
      icon: AlertTriangle,
      badge: pendingCasesCount > 0 ? pendingCasesCount : undefined
    },
    { id: 'reviews', label: 'Avaliações', icon: Star },
    { id: 'settings', label: 'Definições', icon: Settings }
  ];

  return (
    <nav
      id="merchant-mobile-bottom-nav"
      aria-label="Navegação Mobile"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-gray-200 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] px-2 pt-1.5 pb-[calc(env(safe-area-inset-bottom,0px)+6px)] transition-all"
    >
      <div className="max-w-md mx-auto grid grid-cols-5 gap-1 items-center">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all duration-200 relative min-h-[48px] cursor-pointer ${
                isActive
                  ? 'text-[#4285F4] bg-[#4285F4]/10 font-bold'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50 font-medium active:scale-95'
              }`}
            >
              <div className="relative flex items-center justify-center">
                <Icon
                  className={`w-5 h-5 transition-transform duration-200 ${
                    isActive ? 'scale-110 stroke-[2.5]' : 'scale-100'
                  }`}
                />
                {item.badge && (
                  <span className="absolute -top-1.5 -right-2.5 px-1.5 py-0.2 rounded-full text-[9px] font-black bg-[#EA4335] text-white min-w-[16px] text-center shadow-xs animate-pulse">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[10.5px] mt-1 leading-tight tracking-tight whitespace-nowrap">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
