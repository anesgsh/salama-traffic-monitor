import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';

export interface ViolationEvent {
  type: 'violation';
  vehicle_id: number;
  vehicle_type: string;
  violation: string;
  sign_class: number;
  scene: string;
  time: string;
  snap_path: string;
  snap_filename: string;
  thumb_b64: string;
}

export interface StatsEvent {
  type: 'stats';
  fps: number;
  frame: number;
  total: number;
  vehicles: number;
  veh_frame: Record<number, number>;
  veh_counts: Record<number, number>;
}

export type BackendEvent = ViolationEvent | StatsEvent | { type: 'end'; generation?: number };

export interface ExportOptions {
  range?:   string;   // all | last_hour | last_day | last_week | last_month | last_year | custom
  from_ts?: string;
  to_ts?:   string;
  scene?:   string;   // all | CAM_01 | CAM_02 | CAM_03
}

interface BackendContextType {
  backendUrl: string;
  saveBackendUrl: (url: string) => void;
  isConnected:   boolean;
  isConnecting:  boolean;
  isRunning:     boolean;
  isUploading:   boolean;
  uploadProgress: number;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  connect:         () => Promise<void>;
  disconnect:      () => void;
  startMonitoring: (cfg: { conf: number; iou: number; show_zones: boolean; scene: string }) => Promise<void>;
  stopMonitoring:  () => Promise<void>;
  stats:      StatsEvent | null;
  violations: ViolationEvent[];        // accumulated — never cleared
  videoFile:  File | null;
  setVideoFile:    (f: File | null) => void;
  handleFileUpload:(f: File)        => void;
  exportData:      (type: 'violations' | 'vehicles', opts?: ExportOptions) => Promise<void>;
  triggerUpload:   () => void;
  setTriggerUpload:(fn: () => void) => void;
  snapshotUrl:     (filename: string) => string;
}

const BackendContext = createContext<BackendContextType | undefined>(undefined);

export const BackendProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [backendUrl, setBackendUrl]         = useState(() => localStorage.getItem('salama_backend_url') || 'http://localhost:8000');
  const [isConnected, setIsConnected]       = useState(false);
  const [isConnecting, setIsConnecting]     = useState(false);
  const [isRunning, setIsRunning]           = useState(false);
  const [isUploading, setIsUploading]       = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [stats, setStats]                   = useState<StatsEvent | null>(null);
  // violations accumulate across sessions — new video appends, never replaces
  const [violations, setViolations]         = useState<ViolationEvent[]>([]);
  const [videoFile, setVideoFile]           = useState<File | null>(null);

  const uploadTriggerRef = useRef<(() => void) | null>(null);
  const eventWsRef       = useRef<WebSocket | null>(null);
  const frameWsRef       = useRef<WebSocket | null>(null);
  const canvasRef        = useRef<HTMLCanvasElement>(null);

  const setTriggerUpload = useCallback((fn: () => void) => { uploadTriggerRef.current = fn; }, []);
  const triggerUpload    = useCallback(() => { uploadTriggerRef.current?.(); }, []);
  const snapshotUrl      = useCallback((f: string) => `${backendUrl}/api/snapshot/${f}`, [backendUrl]);

  // ── Upload ──────────────────────────────────────────────────
  const uploadToServer = useCallback(async (file: File, url: string) => {
    setIsUploading(true); setUploadProgress(0);
    toast.info(`Uploading ${file.name}…`);
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${url}/api/upload`);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round(e.loaded / e.total * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const resp = JSON.parse(xhr.responseText);
            toast.success(`Video ready (${resp.size_mb} MB)`);
            resolve();
          } else reject(new Error(`HTTP ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error('Network error'));
        const fd = new FormData(); fd.append('file', file); xhr.send(fd);
      });
    } catch (err: any) {
      toast.error(`Upload failed: ${err.message}`);
    } finally { setIsUploading(false); setUploadProgress(0); }
  }, []);

  const handleFileUpload = useCallback(async (file: File) => {
    setVideoFile(file);
    if (backendUrl) await uploadToServer(file, backendUrl);
    else toast.warning(`Video selected — connect first to upload`);
  }, [backendUrl, uploadToServer]);

  const saveBackendUrl = (url: string) => {
    const f = url.replace(/\/$/, '');
    setBackendUrl(f);
    localStorage.setItem('salama_backend_url', f);
  };

  // ── Frame WebSocket ─────────────────────────────────────────
  const _connectFrameWS = useCallback((wsBase: string) => {
    const ws = new WebSocket(`${wsBase}/ws/frames`);
    ws.binaryType = 'arraybuffer';

    ws.onmessage = (msg) => {
      if (typeof msg.data === 'string') {
        if (msg.data === '__END__') setIsRunning(false);
        return;
      }
      const blob = new Blob([msg.data], { type: 'image/jpeg' });
      if (typeof createImageBitmap !== 'undefined') {
        createImageBitmap(blob).then((bitmap) => {
          const canvas = canvasRef.current;
          if (!canvas) { bitmap.close(); return; }
          const ctx = canvas.getContext('2d');
          if (!ctx) { bitmap.close(); return; }
          if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
            canvas.width  = bitmap.width;
            canvas.height = bitmap.height;
          }
          ctx.drawImage(bitmap, 0, 0);
          bitmap.close();
        });
      } else {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
            canvas.width  = img.naturalWidth;
            canvas.height = img.naturalHeight;
          }
          ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(url);
        };
        img.src = url;
      }
    };

    ws.onerror = () => console.error('Frame WS error');
    frameWsRef.current = ws;
  }, []);

  // ── Disconnect ──────────────────────────────────────────────
  const disconnect = useCallback(() => {
    eventWsRef.current?.close(); eventWsRef.current = null;
    frameWsRef.current?.close(); frameWsRef.current = null;
    setIsConnected(false); setIsRunning(false);
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  // ── Connect ─────────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (!backendUrl) { toast.error('Enter a backend URL'); return; }
    setIsConnecting(true); disconnect();
    try {
      const wsBase = backendUrl.replace(/^http/, 'ws');
      const eventWs = new WebSocket(`${wsBase}/ws/events`);

      eventWs.onopen = async () => {
        setIsConnected(true); setIsConnecting(false);
        toast.success('Connected to Salama backend');
        if (videoFile) await uploadToServer(videoFile, backendUrl);
        _connectFrameWS(wsBase);
      };

      eventWs.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data) as BackendEvent;
          if (data.type === 'stats') {
            setStats(data);
          } else if (data.type === 'violation') {
            // APPEND — never replace the full list
            setViolations(prev => [data, ...prev]);
            try {
              const actx = new AudioContext();
              const osc  = actx.createOscillator();
              const gain = actx.createGain();
              osc.connect(gain); gain.connect(actx.destination);
              osc.frequency.value = 880; osc.type = 'sine';
              gain.gain.setValueAtTime(0.3, actx.currentTime);
              gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.5);
              osc.start(); osc.stop(actx.currentTime + 0.5);
            } catch (_) {}
            toast.error(`🚨 ${data.violation}`, {
              description: `${data.vehicle_type} #${data.vehicle_id} — ${data.scene} at ${new Date(data.time).toLocaleTimeString()}`,
              duration: 7000,
            });
          } else if (data.type === 'end') {
            setIsRunning(false);
            toast.info('Processing complete');
          }
        } catch (e) { console.error('Event parse error', e); }
      };

      eventWs.onclose   = () => { setIsConnected(false); setIsConnecting(false); };
      eventWs.onerror   = () => { setIsConnecting(false); toast.error('Could not connect'); };
      eventWsRef.current = eventWs;
    } catch { setIsConnecting(false); toast.error('Connection error'); }
  }, [backendUrl, disconnect, videoFile, uploadToServer, _connectFrameWS]);

  // ── Start monitoring ────────────────────────────────────────
  const startMonitoring = async (cfg: { conf: number; iou: number; show_zones: boolean; scene: string }) => {
    if (!isConnected) { toast.error('Not connected'); return; }
    try {
      const res  = await fetch(`${backendUrl}/api/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      const data = await res.json();
      if (res.ok && data.status === 'started') {
        setIsRunning(true);
        setStats(null);
        // Clear canvas for the new video
        const canvas = canvasRef.current;
        if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
        // Re-connect frame WS to pick up new stream
        const wsBase = backendUrl.replace(/^http/, 'ws');
        frameWsRef.current?.close();
        _connectFrameWS(wsBase);
        toast.success('Monitoring started');
      } else {
        toast.error(data.detail || 'Upload a video first');
      }
    } catch { toast.error('Start failed — is the backend running?'); }
  };

  // ── Stop monitoring ─────────────────────────────────────────
  const stopMonitoring = async () => {
    try {
      await fetch(`${backendUrl}/api/stop`, { method: 'POST' });
      setIsRunning(false);
      toast.info('Monitoring stopped');
    } catch { toast.error('Stop failed'); }
  };

  // ── Export ──────────────────────────────────────────────────
  const exportData = async (type: 'violations' | 'vehicles', opts: ExportOptions = {}) => {
    if (!backendUrl) { toast.error('Not connected'); return; }
    try {
      const params = new URLSearchParams();
      if (opts.range)   params.set('range',   opts.range);
      if (opts.from_ts) params.set('from_ts', opts.from_ts);
      if (opts.to_ts)   params.set('to_ts',   opts.to_ts);
      if (opts.scene)   params.set('scene',   opts.scene);
      const res = await fetch(`${backendUrl}/api/export/${type}?${params}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `${type}_${Date.now()}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) { toast.error(`Export failed: ${err.message}`); }
  };

  return (
    <BackendContext.Provider value={{
      backendUrl, saveBackendUrl,
      isConnected, isConnecting, isRunning,
      isUploading, uploadProgress,
      canvasRef,
      connect, disconnect,
      startMonitoring, stopMonitoring,
      stats, violations,
      videoFile, setVideoFile, handleFileUpload,
      exportData, triggerUpload, setTriggerUpload,
      snapshotUrl,
    }}>
      {children}
    </BackendContext.Provider>
  );
};

export const useBackend = () => {
  const ctx = useContext(BackendContext);
  if (!ctx) throw new Error('useBackend must be used within BackendProvider');
  return ctx;
};
