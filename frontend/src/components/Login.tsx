import React, { useState } from 'react';
import { useAuth } from '@/src/context/AuthContext';
import { useLanguage } from '@/src/context/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Lock, User, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

export const Login: React.FC = () => {
  const { t } = useLanguage();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(false);

    const success = await login(username, password);
    if (!success) {
      setError(true);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
      >
        <Card className="w-full max-w-[400px] border-border bg-card shadow-2xl rounded-xl">
          <CardHeader className="text-center space-y-2 pb-0 pt-0 px-12">
            <div className="mx-auto w-62 flex items-center justify-start -ml-10">
              <img
                src="/logo.png"
                alt="Salama Logo"
                className="w-full h-full object-contain"
              />
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {t('username')}
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="username"
                    placeholder="admin"
                    className="pl-10 h-11 bg-secondary/50"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {t('password')}
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    className="pl-10 h-11 bg-secondary/50"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center gap-3 text-destructive text-xs font-medium"
                >
                  <AlertCircle className="w-4 h-4" />
                  {t('invalid_credentials')}
                </motion.div>
              )}

              <Button type="submit" className="w-full h-11 text-sm font-bold" disabled={loading}>
                {loading ? t('connecting') : t('login')}
              </Button>

              <p className="text-center text-[9px] text-muted-foreground uppercase tracking-[0.2em] font-bold pt-2">
                {t('secure_protocol')}
              </p>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};