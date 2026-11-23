import React from 'react';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BackendProvider, useBackend } from './context/BackendContext';
import { NavigationProvider, useNavigation } from './context/NavigationContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
const Dashboard = React.lazy(() =>
  import('./components/Dashboard').then(m => ({ default: m.Dashboard }))
);

const Analytics = React.lazy(() =>
  import('./components/Analytics').then(m => ({ default: m.Analytics }))
);

const History = React.lazy(() =>
  import('./components/History').then(m => ({ default: m.History }))
);

const Settings = React.lazy(() =>
  import('./components/Settings').then(m => ({ default: m.Settings }))
);
import { Login } from './components/Login';
import { Toaster } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

const AppContent: React.FC = () => {
  const { isAuthenticated } = useAuth();
  // Always go to dashboard after login — NavigationContext default is 'dashboard'
  const { activeTab, sidebarOpen } = useNavigation();
  const { isRTL } = useLanguage();
  const { setTriggerUpload, handleFileUpload } = useBackend();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setTriggerUpload(() => { fileInputRef.current?.click(); });
  }, [setTriggerUpload]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
  };

  if (!isAuthenticated) return <Login />;

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'analytics': return <Analytics />;
      case 'history': return <History />;
      case 'settings': return <Settings />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden" dir={isRTL ? 'rtl' : 'ltr'}>
      <input type="file" accept="video/*" className="hidden" ref={fileInputRef} onChange={onFileChange} />

      {/* Sidebar — collapses to zero width when closed */}
      <div className={cn(
        'transition-all duration-300 overflow-hidden flex-shrink-0',
        sidebarOpen ? 'w-[240px]' : 'w-0'
      )}>
        <Sidebar />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              <React.Suspense
                fallback={
                  <div className="flex items-center justify-center h-full">
                    Loading...
                  </div>
                }
              >
                {renderContent()}
              </React.Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <Toaster position={isRTL ? 'bottom-left' : 'bottom-right'} theme="dark" />
    </div>
  );
};

export default function App() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <AuthProvider>
          <NavigationProvider>
            <BackendProvider>
              <AppContent />
            </BackendProvider>
          </NavigationProvider>
        </AuthProvider>
      </ThemeProvider>
    </LanguageProvider>
  );
}
