import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/src/context/LanguageContext';
import { useTheme } from '@/src/context/ThemeContext';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Globe, Moon, Shield, Bell, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export const Settings: React.FC = () => {
  const { t, language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();

  return (
    <div className="p-6 space-y-6 bg-background min-h-full max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t('settings')}</h2>
        <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">{t('manage_preferences')}</p>
      </div>

      <div className="space-y-6">
        {/* Language */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="p-5 border-b">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-500" />
              {t('language')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">{t('language')}</Label>
                <p className="text-xs text-muted-foreground">{t('language_desc')}</p>
              </div>
              <Select value={language} onValueChange={(v: any) => setLanguage(v)}>
                <SelectTrigger className="w-[180px] h-9 bg-secondary/50">
                  <SelectValue placeholder={t('select_language')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ar">العربية</SelectItem>
                  <SelectItem value="fr">Français</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Theme */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="p-5 border-b">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Moon className="w-4 h-4 text-purple-500" />
              {t('theme')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">{t('dark_mode')}</Label>
                <p className="text-xs text-muted-foreground">{t('dark_mode_desc')}</p>
              </div>
              <Switch
                checked={theme === 'dark'}
                onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
              />
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="p-5 border-b">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Bell className="w-4 h-4 text-yellow-500" />
              {t('notifications')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">{t('desktop_notifications')}</Label>
                <p className="text-xs text-muted-foreground">{t('desktop_notifications_desc')}</p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">{t('sound_alerts')}</Label>
                <p className="text-xs text-muted-foreground">{t('sound_alerts_desc')}</p>
              </div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>

        {/* Security */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="p-5 border-b">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Shield className="w-4 h-4 text-green-500" />
              {t('security')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">{t('data_encryption')}</Label>
                <p className="text-xs text-muted-foreground">{t('data_encryption_desc')}</p>
              </div>
              <Badge variant="outline" className="text-green-500 border-green-500/50 bg-green-500/10 text-[10px] font-bold">
                {t('active')}
              </Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">{t('two_factor')}</Label>
                <p className="text-xs text-muted-foreground">{t('two_factor_desc')}</p>
              </div>
              <Button variant="outline" size="sm" className="h-8 text-[10px] font-bold uppercase tracking-wider">
                {t('enable')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button className="h-10 px-8 font-bold">
            <Save className="w-4 h-4 mr-2" />
            {t('save_settings')}
          </Button>
        </div>
      </div>
    </div>
  );
};