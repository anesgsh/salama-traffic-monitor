import React, { useState } from 'react';
import { Play, Square, Activity, Car, AlertTriangle, Cpu, Camera, Loader2, ZoomIn } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/src/context/LanguageContext';
import { useBackend } from '@/src/context/BackendContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { motion } from 'motion/react';
import { SnapshotLightbox } from './SnapshotLightbox';

export const Dashboard: React.FC = () => {
  const { t, isRTL } = useLanguage();
  const {
    isConnected, isRunning, isUploading, uploadProgress,
    startMonitoring, stopMonitoring,
    stats, violations, canvasRef,
    backendUrl, saveBackendUrl, connect, exportData,
    videoFile, snapshotUrl,
  } = useBackend();

  const [scene, setScene] = useState('CAM_01');
  const [confidence, setConfidence] = useState(0.25);
  const [iou, setIou] = useState(0.45);
  const [showZones, setShowZones] = useState(true);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const handleStart = () => startMonitoring({ conf: confidence, iou, show_zones: showZones, scene });

  const statsCards = [
    { label: t('active_vehicles'), value: stats?.vehicles ?? 0, color: 'text-blue-500', meta: 'LIVE' },
    { label: t('total_violations'), value: violations.length, color: 'text-red-500', meta: violations.length > 0 ? '🚨' : 'OK' },
    { label: t('fps'), value: stats ? `${stats.fps.toFixed(1)}` : '—', color: 'text-green-500', meta: 'CPU' },
    { label: t('frame'), value: `${stats?.frame ?? 0} / ${stats?.total ?? 0}`, color: 'text-purple-500', meta: 'SRC' },
  ];

  return (
    <div className="p-6 space-y-6 min-h-full bg-background">
      <SnapshotLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {statsCards.map((card, idx) => (
          <motion.div key={card.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
            <Card className="border-border bg-card shadow-sm">
              <CardContent className="p-5">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{card.label}</p>
                <div className="flex items-end justify-between">
                  <p className="text-2xl font-bold tracking-tight">{card.value}</p>
                  <div className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded bg-secondary', card.color)}>{card.meta}</div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">

          {/* Canvas feed */}
          <Card className="overflow-hidden border-border bg-black relative aspect-video flex items-center justify-center rounded-xl shadow-lg">
            <canvas
              ref={canvasRef}
              className={cn('w-full h-full object-contain', !isRunning && 'hidden')}
            />
            {!isRunning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-muted-foreground/30">
                <Camera className="w-16 h-16" />
                <p className="text-[10px] font-bold uppercase tracking-[0.2em]">{t('realtime_feed')}</p>
              </div>
            )}
            <div className={cn('absolute top-4 flex items-center gap-2 z-10', isRTL ? 'right-4' : 'left-4')}>
              <div className="bg-black/60 backdrop-blur-md border border-white/10 text-white px-3 py-1 rounded text-[10px] font-bold tracking-wider flex items-center gap-2">
                <div className={cn('w-1.5 h-1.5 rounded-full', isRunning ? 'bg-red-500 animate-pulse' : 'bg-gray-500')} />
                {isRunning ? `LIVE: ${scene}` : 'STANDBY'}
              </div>
            </div>
            {isUploading && (
              <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3 z-20">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm font-bold text-white">Uploading… {uploadProgress}%</p>
                <div className="w-48 h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            )}
          </Card>

          {/* Controls */}
          <Card className="border-border bg-card shadow-sm">
            <CardContent className="p-6 space-y-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-[200px] space-y-1.5">
                  {/* Label: no ngrok word — just "Backend URL" */}
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {t('backend_url')}
                  </Label>
                  <Input
                    placeholder="http://localhost:8000"
                    value={backendUrl}
                    onChange={(e) => saveBackendUrl(e.target.value)}
                    className="h-9 font-mono text-xs bg-secondary/50"
                  />
                </div>
                <div className="w-36 space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t('camera')}</Label>
                  <Input value={scene} onChange={(e) => setScene(e.target.value)} className="h-9 bg-secondary/50" />
                </div>
                <Button variant="secondary" size="sm" className="h-9 px-4 font-bold" onClick={connect}>{t('connect')}</Button>
              </div>

              <div className="flex flex-wrap items-center gap-6">
                <div className="w-44 space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {t('confidence')}: {confidence.toFixed(2)}
                  </Label>
                  <input type="range" min={0.1} max={0.9} step={0.05} value={confidence}
                    onChange={(e) => setConfidence(parseFloat(e.target.value))} className="w-full accent-primary" />
                </div>
                <div className="w-44 space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    IoU: {iou.toFixed(2)}
                  </Label>
                  <input type="range" min={0.1} max={0.9} step={0.05} value={iou}
                    onChange={(e) => setIou(parseFloat(e.target.value))} className="w-full accent-primary" />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={showZones} onCheckedChange={setShowZones} />
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t('show_zones')}</Label>
                </div>
                <div className="ml-auto">
                  {!isRunning ? (
                    <Button size="sm" className="h-9 px-6 font-bold"
                      disabled={!isConnected || !videoFile || isUploading} onClick={handleStart}>
                      <Play className="w-3.5 h-3.5 mr-2" />
                      {isUploading ? 'Uploading…' : videoFile ? t('start') : t('upload_video')}
                    </Button>
                  ) : (
                    <Button variant="destructive" size="sm" className="h-9 px-6 font-bold" onClick={stopMonitoring}>
                      <Square className="w-3.5 h-3.5 mr-2" />{t('stop')}
                    </Button>
                  )}
                </div>
              </div>

              {videoFile && (
                <p className="text-[10px] text-muted-foreground font-mono">
                  📹 {videoFile.name} ({(videoFile.size / 1024 / 1024).toFixed(1)} MB)
                  {isUploading ? ` — uploading ${uploadProgress}%` : ' — ready on server'}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right panel */}
        <div className="space-y-6">
          <Card className="border-border bg-card shadow-sm flex flex-col h-[500px]">
            <CardHeader className="p-5 border-b">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />{t('recent_alerts')}
                </div>
                <Badge variant="secondary" className="text-[10px]">{violations.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="divide-y divide-border">
                  {violations.length === 0 ? (
                    <div className="p-8 text-center space-y-2 opacity-30">
                      <Activity className="w-8 h-8 mx-auto" />
                      <p className="text-[10px] font-bold uppercase tracking-widest">{t('no_violations')}</p>
                    </div>
                  ) : violations.map((v, idx) => (
                    <motion.div key={`${v.vehicle_id}-${v.time}-${idx}`}
                      initial={{ opacity: 0, x: isRTL ? 20 : -20 }} animate={{ opacity: 1, x: 0 }}
                      className="p-4 hover:bg-secondary/30 transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-muted-foreground">
                          {new Date(v.time).toLocaleTimeString()}
                        </span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 uppercase">
                          {t('high_severity')}
                        </span>
                      </div>
                      <p className="text-xs font-bold mb-2">{v.violation}: {v.vehicle_type} #{v.vehicle_id}</p>
                      <p className="text-[10px] text-muted-foreground font-mono mb-1">{v.scene}</p>
                      {v.thumb_b64 && (
                        <div className="relative w-full rounded bg-black overflow-hidden border border-white/5 cursor-pointer group"
                          onClick={() => setLightboxUrl(snapshotUrl(v.snap_filename))}>
                          <img src={`data:image/jpeg;base64,${v.thumb_b64}`} alt={t('snapshot')}
                            className="w-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                            <div className="bg-black/60 rounded-full p-2"><ZoomIn className="w-4 h-4 text-white" /></div>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="border-border bg-card shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="space-y-0.5">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{t('historical_trends')}</p>
                <p className="text-xs font-medium">{t('last_24h')}</p>
              </div>
              <div className="flex gap-1 items-end h-8">
                {[20, 35, 25, 40, 30, 15, 38, 22, 28, 35].map((h, i) => (
                  <div key={i} className="w-1.5 bg-primary/40 rounded-t-sm" style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
            <Button variant="outline" size="sm" className="w-full h-8 text-[10px] font-bold uppercase tracking-wider"
              onClick={() => exportData('violations')}>
              {t('export_csv')}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
};
