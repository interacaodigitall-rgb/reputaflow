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
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'crm', label: 'CRM', icon: Users },
    {
      id: 'recovery',
      label: 'Recuperação',
      icon: AlertTriangle,
      badge: pendingCasesCount > 0 ? pendingCasesCount : undefined
    },
    { id: 'reviews', label: 'Avaliações', icon: Star },
    { id: 'settings', label: 'Ajustes', icon: Settings }
  ];

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1 flex items-center justify-around shadow-lg">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSelectTab(item.id)}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition relative min-w-[56px] ${
              isActive ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <div className="relative">
              <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : ''}`} />
              {item.badge && (
                <span className="absolute -top-1 -right-2 px-1 rounded-full text-[9px] font-black bg-rose-500 text-white min-w-[14px] text-center">
                  {item.badge}
                </span>
              )}
            </div>
            <span className={`text-[10px] mt-0.5 ${isActive ? 'font-bold' : 'font-medium'}`}>
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};
