import React from 'react';
import { Bell, Globe, Menu } from 'lucide-react';
import { useLanguage } from '@/src/context/LanguageContext';
import { useAuth } from '@/src/context/AuthContext';
import { useBackend } from '@/src/context/BackendContext';
import { useNavigation } from '@/src/context/NavigationContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export const Header: React.FC = () => {
  const { t, language, setLanguage } = useLanguage();
  const { isConnected, isConnecting, triggerUpload, violations } = useBackend();
  const { setActiveTab, toggleSidebar } = useNavigation();

  const handleUploadClick = () => {
    setActiveTab('dashboard');
    setTimeout(() => triggerUpload(), 100);
  };

  return (
    <header className="h-16 border-b bg-card flex items-center justify-between px-4 sticky top-0 z-50 flex-shrink-0">
      <div className="flex items-center gap-3">
        {/* Sidebar toggle */}
        <Button variant="ghost" size="icon" className="w-8 h-8 rounded-md text-muted-foreground" onClick={toggleSidebar}>
          <Menu className="w-4 h-4" />
        </Button>
        <div className="text-sm font-medium text-muted-foreground">
          {t('overview')} / <span className="text-foreground">{t('central_station')}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Connection status */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary rounded-md border text-[10px] font-bold tracking-widest uppercase">
          {isConnecting
            ? <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
            : isConnected
              ? <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              : <div className="w-1.5 h-1.5 rounded-full bg-red-500" />}
          {isConnecting ? t('connecting') : isConnected ? t('connected') : t('disconnected')}
        </div>

        <div className="h-6 w-px bg-border" />

        {/* Language */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="secondary" size="sm" className="h-8 gap-2 text-xs" />
            }
          >
            <Globe className="w-3.5 h-3.5" />
            {language.toUpperCase()}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setLanguage('en')}>English</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLanguage('ar')}>العربية</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLanguage('fr')}>Français</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="w-8 h-8 rounded-md relative text-muted-foreground">
          <Bell className="w-4 h-4" />
          {violations.length > 0 && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-destructive text-[8px] flex items-center justify-center rounded-full text-white font-bold border-2 border-card">
              {violations.length > 9 ? '9+' : violations.length}
            </span>
          )}
        </Button>

        {/* Upload */}
        <Button size="sm" className="h-8 text-xs font-bold" onClick={handleUploadClick}>
          {t('upload_video_btn')}
        </Button>
      </div>
    </header>
  );
};
