import React from 'react';
import { Home, Users, Droplet, BookOpen, Shield } from 'lucide-react';
import { ActivePage, UserRole } from '../types';

interface BottomNavProps {
  activePage: ActivePage;
  onNavigate: (page: ActivePage) => void;
  role: UserRole;
  urgentRequestsCount: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activePage,
  onNavigate,
  role,
  urgentRequestsCount
}) => {
  const navItems = [
    {
      id: 'home' as ActivePage,
      label: 'الرئيسية',
      icon: Home
    },
    {
      id: 'donors' as ActivePage,
      label: 'المتبرعون',
      icon: Users
    },
    {
      id: 'requests' as ActivePage,
      label: 'طلبات الدم',
      icon: Droplet,
      badge: urgentRequestsCount > 0 ? urgentRequestsCount : null
    },
    {
      id: 'info' as ActivePage,
      label: 'معلومات التبرع',
      icon: BookOpen
    },
    // إخفاء وحماية رمز المسؤول من شريط التنقل العام لغير المسؤولين
    ...(role === 'admin'
      ? [
          {
            id: 'admin' as ActivePage,
            label: 'لوحة الإدارة',
            icon: Shield,
            adminOnly: true
          }
        ]
      : [])
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-2px_12px_rgba(0,0,0,0.04)] pb-safe">
      <div className="max-w-md mx-auto flex items-center justify-around px-2 py-1.5 sm:py-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            activePage === item.id ||
            (item.id === 'home' && activePage === 'hospital-ad') ||
            (item.id === 'admin' && activePage === 'districts');

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`relative flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all duration-200 cursor-pointer ${
                isActive
                  ? 'text-rose-700 font-bold scale-102'
                  : 'text-slate-500 hover:text-slate-800 font-medium'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 sm:w-5.5 sm:h-5.5 transition-transform ${
                    isActive ? 'stroke-[2.4px] text-rose-700' : 'stroke-[1.8px] text-slate-500'
                  }`}
                />
                {item.badge && (
                  <span className="absolute -top-1 -right-2 bg-rose-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] mt-1 truncate max-w-[70px]">
                {item.label}
              </span>
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-rose-600 mt-0.5"></span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
