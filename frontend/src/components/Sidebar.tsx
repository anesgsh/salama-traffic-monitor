import React from 'react';
import { LayoutDashboard, BarChart3, History, Settings, LogOut, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/src/context/LanguageContext';
import { useAuth } from '@/src/context/AuthContext';
import { useBackend } from '@/src/context/BackendContext';
import { useNavigation } from '@/src/context/NavigationContext';
import { Button } from '@/components/ui/button';

export const Sidebar: React.FC = () => {
  const { t, isRTL } = useLanguage();
  const { logout, user } = useAuth();
  const { activeTab, setActiveTab } = useNavigation();

  const menuItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: t('dashboard') },
    { id: 'analytics', icon: BarChart3, label: t('analytics') },
    { id: 'history', icon: History, label: t('history') },
    { id: 'settings', icon: Settings, label: t('settings') },
  ];

  return (
    <div className={cn(
      "w-[240px] h-screen border-e bg-card flex flex-col transition-all duration-300",
      isRTL ? "border-l" : "border-r"
    )}>
      <div className="p-6 border-b flex items-center gap-3">
        <div className="w-12 h-12 flex items-center justify-center overflow-hidden">
          <img
            src="/favicon.png"
            alt="Salama Logo"
            className="w-full h-full object-contain"
            referrerPolicy="no-referrer"
          />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-primary">SALAMA</h1>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200",
              activeTab === item.id
                ? "bg-secondary text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
            )}
          >
            <item.icon className="w-[18px] h-[18px]" />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t space-y-4">
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold border">
            {user?.username.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.username}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">{user?.role}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-10 px-3"
          onClick={logout}
        >
          <LogOut className="w-[18px] h-[18px]" />
          {t('logout')}
        </Button>
      </div>
    </div>
  );
};
