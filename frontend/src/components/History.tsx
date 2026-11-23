import React, { useState } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useLanguage } from '@/src/context/LanguageContext';
import { useBackend, ExportOptions } from '@/src/context/BackendContext';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SnapshotLightbox } from './SnapshotLightbox';
import { motion, AnimatePresence } from 'motion/react';

// ── Export dialog ─────────────────────────────────────────────
interface ExportDialogProps {
  onClose: () => void;
  onExport: (opts: ExportOptions) => void;
}

const ExportDialog: React.FC<ExportDialogProps> = ({ onClose, onExport }) => {
  const [range, setRange] = useState('all');
  const [scene, setScene] = useState('all');
  const [fromTs, setFromTs] = useState('');
  const [toTs, setToTs] = useState('');

  const RANGES = [
    { value: 'all', label: 'All data' },
    { value: 'last_hour', label: 'Last Hour' },
    { value: 'last_day', label: 'Last 24 Hours' },
    { value: 'last_week', label: 'Last Week' },
    { value: 'last_month', label: 'Last Month' },
    { value: 'last_year', label: 'Last Year' },
    { value: 'custom', label: 'Custom Range…' },
  ];
  const SCENES = [
    { value: 'all', label: 'All Cameras' },
    { value: 'CAM_01', label: 'Camera 1 (CAM_01)' },
    { value: 'CAM_02', label: 'Camera 2 (CAM_02)' },
    { value: 'CAM_03', label: 'Camera 3 (CAM_03)' },
  ];

  const handle = () => {
    const opts: ExportOptions = { range, scene };
    if (range === 'custom') { opts.from_ts = fromTs; opts.to_ts = toTs; }
    onExport(opts); onClose();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-widest">Export Violations</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Time Range</Label>
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="h-9 bg-secondary/50"><SelectValue /></SelectTrigger>
            <SelectContent>{RANGES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {range === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">From</Label>
              <Input type="datetime-local" value={fromTs} onChange={(e) => setFromTs(e.target.value)} className="h-9 bg-secondary/50 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">To</Label>
              <Input type="datetime-local" value={toTs} onChange={(e) => setToTs(e.target.value)} className="h-9 bg-secondary/50 text-xs" />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Camera</Label>
          <Select value={scene} onValueChange={setScene}>
            <SelectTrigger className="h-9 bg-secondary/50"><SelectValue /></SelectTrigger>
            <SelectContent>{SCENES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" className="flex-1 h-9" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 h-9 font-bold" onClick={handle}>
            <Download className="w-3.5 h-3.5 mr-2" />Export CSV
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── History page ──────────────────────────────────────────────
export const History: React.FC = () => {
  const { t } = useLanguage();
  const { violations, exportData, snapshotUrl } = useBackend();
  const [search, setSearch] = useState('');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);

  // violations is accumulated — all videos are shown here
  const filtered = violations.filter(v =>
    v.violation.toLowerCase().includes(search.toLowerCase()) ||
    v.vehicle_type.toLowerCase().includes(search.toLowerCase()) ||
    v.vehicle_id.toString().includes(search) ||
    v.scene.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 bg-background min-h-full">
      <SnapshotLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />

      <AnimatePresence>
        {showExport && (
          <ExportDialog
            onClose={() => setShowExport(false)}
            onExport={(opts) => exportData('violations', opts)}
          />
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('history')}</h2>
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">
            {t('recent_events')} &amp; {t('violations')} — all sessions
          </p>
        </div>
        {/* Single export violations button */}
        <Button variant="outline" size="sm" className="h-9 text-[10px] font-bold uppercase tracking-wider"
          onClick={() => setShowExport(true)}>
          <Download className="w-3.5 h-3.5 mr-2" />{t('export_data')}
        </Button>
      </div>

      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="p-5 border-b">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder={t('search')} className="pl-9 h-9 bg-secondary/50 text-xs"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b border-border/50">
                <TableHead className="uppercase text-[10px] tracking-widest font-bold">{t('detected_at')}</TableHead>
                <TableHead className="uppercase text-[10px] tracking-widest font-bold">{t('vehicle_type')}</TableHead>
                <TableHead className="uppercase text-[10px] tracking-widest font-bold">{t('violation_type')}</TableHead>
                <TableHead className="uppercase text-[10px] tracking-widest font-bold">{t('scene')}</TableHead>
                <TableHead className="text-right uppercase text-[10px] tracking-widest font-bold">{t('snapshot')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-40 text-center text-muted-foreground opacity-50 uppercase tracking-widest text-xs">
                    {t('no_violations')}
                  </TableCell>
                </TableRow>
              ) : filtered.map((v, idx) => (
                <TableRow key={`${v.vehicle_id}-${v.time}-${idx}`} className="border-b border-border/50 group">
                  <TableCell className="font-mono text-xs">
                    {new Date(v.time).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px] uppercase font-mono">
                      {v.vehicle_type} #{v.vehicle_id}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-bold text-red-500">{v.violation}</span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">{v.scene}</TableCell>
                  <TableCell className="text-right">
                    {v.thumb_b64 && (
                      <div className="flex justify-end cursor-pointer"
                        onClick={() => setLightboxUrl(snapshotUrl(v.snap_filename))}>
                        <div className="relative w-16 h-10 rounded border bg-black overflow-hidden group-hover:scale-125 transition-transform origin-right">
                          <img src={`data:image/jpeg;base64,${v.thumb_b64}`} alt={t('snapshot')}
                            className="w-full h-full object-cover" />
                        </div>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
