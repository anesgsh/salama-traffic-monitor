import React, { useMemo, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/src/context/LanguageContext';
import { useBackend, ExportOptions } from '@/src/context/BackendContext';
import {
  Download, TrendingUp, Users, AlertCircle, Clock,
  Activity, Shield, BarChart2, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'motion/react';

const COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899'];
const TT = {
  contentStyle: { backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px' },
  itemStyle: { fontSize: '12px' },
  labelStyle: { fontSize: '12px', color: '#aaa' },
};

// ── Static reference data shown when no video has been processed ──
const REF_TRAFFIC = [
  { time: '06:00', cars: 12, trucks: 3, buses: 1 },
  { time: '08:00', cars: 55, trucks: 12, buses: 6 },
  { time: '10:00', cars: 42, trucks: 18, buses: 4 },
  { time: '12:00', cars: 68, trucks: 22, buses: 8 },
  { time: '14:00', cars: 57, trucks: 20, buses: 7 },
  { time: '16:00', cars: 88, trucks: 14, buses: 10 },
  { time: '18:00', cars: 72, trucks: 9, buses: 8 },
  { time: '20:00', cars: 38, trucks: 6, buses: 3 },
  { time: '22:00', cars: 18, trucks: 4, buses: 1 },
];

const REF_VIOLATIONS_BY_TYPE = [
  { name: 'Stop Sign Violation', value: 18 },
  { name: 'Red Light Running', value: 12 },
  { name: 'No Entry Violation', value: 7 },
  { name: 'No Left Turn', value: 5 },
];

const REF_VIOLATIONS_BY_HOUR = Array.from({ length: 24 }, (_, h) => ({
  hour: `${String(h).padStart(2, '0')}:00`,
  violations: [0, 0, 0, 2, 1, 3, 5, 8, 6, 4, 3, 5, 7, 6, 5, 4, 6, 9, 8, 5, 3, 2, 1, 0][h] || 0,
}));

const REF_VEHICLE_BREAKDOWN = [
  { name: 'Cars', value: 245, color: '#3b82f6' },
  { name: 'Motorcycles', value: 87, color: '#f59e0b' },
  { name: 'Buses', value: 34, color: '#10b981' },
  { name: 'Trucks', value: 62, color: '#8b5cf6' },
];

const REF_BY_SCENE = [
  { name: 'CAM_01', value: 18 },
  { name: 'CAM_02', value: 12 },
  { name: 'CAM_03', value: 7 },
];

const REF_RADAR = [
  { subject: 'Stop Sign', value: 72 },
  { subject: 'Red Light', value: 48 },
  { subject: 'No Entry', value: 28 },
  { subject: 'No Left', value: 20 },
  { subject: 'No Right', value: 15 },
];

// ── Export dialog ─────────────────────────────────────────────
interface ExportDialogProps { onClose: () => void; onExport: (opts: ExportOptions) => void; }

const ExportDialog: React.FC<ExportDialogProps> = ({ onClose, onExport }) => {
  const [range, setRange] = useState('all');
  const [scene, setScene] = useState('all');
  const [fromTs, setFromTs] = useState('');
  const [toTs, setToTs] = useState('');

  const RANGES = [
    { value: 'all', label: 'All data' }, { value: 'last_hour', label: 'Last Hour' },
    { value: 'last_day', label: 'Last 24 Hours' }, { value: 'last_week', label: 'Last Week' },
    { value: 'last_month', label: 'Last Month' }, { value: 'last_year', label: 'Last Year' },
    { value: 'custom', label: 'Custom Range…' },
  ];
  const SCENES = [
    { value: 'all', label: 'All Cameras' }, { value: 'CAM_01', label: 'Camera 1 (CAM_01)' },
    { value: 'CAM_02', label: 'Camera 2 (CAM_02)' }, { value: 'CAM_03', label: 'Camera 3 (CAM_03)' },
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
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-widest">Export Vehicle Stats</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
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
              <Input type="datetime-local" value={fromTs} onChange={e => setFromTs(e.target.value)} className="h-9 bg-secondary/50 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">To</Label>
              <Input type="datetime-local" value={toTs} onChange={e => setToTs(e.target.value)} className="h-9 bg-secondary/50 text-xs" />
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

// ── Analytics page ────────────────────────────────────────────
export const Analytics: React.FC = () => {
  const { t } = useLanguage();
  const { stats, violations, exportData } = useBackend();
  const [showExport, setShowExport] = useState(false);

  // hasRealData = at least one video has been processed
  const hasRealData = violations.length > 0 || (stats?.veh_counts
    ? Object.values(stats.veh_counts).some(v => v > 0) : false);

  // ── Live/accumulated data derived from real violations ─────
  const liveViolationsByType = useMemo(() => {
    const counts: Record<string, number> = {};
    violations.forEach(v => { counts[v.violation] = (counts[v.violation] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [violations]);

  const liveViolationsByHour = useMemo(() => {
    const counts: Record<number, number> = {};
    violations.forEach(v => {
      try { const h = new Date(v.time).getHours(); counts[h] = (counts[h] || 0) + 1; } catch { }
    });
    return Array.from({ length: 24 }, (_, h) => ({
      hour: `${String(h).padStart(2, '0')}:00`, violations: counts[h] || 0,
    }));
  }, [violations]);

  const liveViolationsByScene = useMemo(() => {
    const counts: Record<string, number> = {};
    violations.forEach(v => { counts[v.scene] = (counts[v.scene] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [violations]);

  const liveVehicleBreakdown = useMemo(() => {
    const vc = stats?.veh_counts || { 2: 0, 3: 0, 5: 0, 7: 0 };
    return [
      { name: t('cars'), value: vc[2] || 0, color: '#3b82f6' },
      { name: t('motorcycles'), value: vc[3] || 0, color: '#f59e0b' },
      { name: t('buses'), value: vc[5] || 0, color: '#10b981' },
      { name: t('trucks'), value: vc[7] || 0, color: '#8b5cf6' },
    ];
  }, [stats, t]);

  const liveRadar = useMemo(() => {
    const types = ['Stop Sign Violation', 'Red Light Running', 'No Entry Violation',
      'No Left Turn Violation', 'No Right Turn Violation'];
    const counts = types.map(vt => violations.filter(v => v.violation === vt).length);
    const mx = Math.max(...counts, 1);
    return types.map((name, i) => ({
      subject: name.replace(' Violation', '').replace(' Running', ''),
      value: Math.round(counts[i] / mx * 100),
    }));
  }, [violations]);

  // Choose data source: real if available, reference otherwise
  const violationsByType = hasRealData ? liveViolationsByType : REF_VIOLATIONS_BY_TYPE;
  const violationsByHour = hasRealData ? liveViolationsByHour : REF_VIOLATIONS_BY_HOUR;
  const violationsByScene = hasRealData ? liveViolationsByScene : REF_BY_SCENE;
  const vehicleBreakdown = hasRealData ? liveVehicleBreakdown : REF_VEHICLE_BREAKDOWN;
  const radarData = hasRealData ? liveRadar : REF_RADAR;

  const totalVehicles = vehicleBreakdown.reduce((s, v) => s + v.value, 0);
  const complianceRate = totalVehicles > 0
    ? Math.round((1 - violations.length / Math.max(totalVehicles, 1)) * 1000) / 10
    : 98.4;

  const peakHour = violationsByHour.reduce((best, h) =>
    h.violations > best.violations ? h : best, violationsByHour[0] || { hour: '16:00', violations: 0 }).hour;

  return (
    <div className="p-6 space-y-6 bg-background min-h-full">
      <AnimatePresence>
        {showExport && (
          <ExportDialog onClose={() => setShowExport(false)}
            onExport={opts => exportData('vehicles', opts)} />
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('analytics')}</h2>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">
              {t('traffic_trends')} &amp; {t('violation_distribution')}
            </p>
            {!hasRealData && (
              <Badge variant="secondary" className="text-[9px] uppercase tracking-wider">
                Reference data — run a video to see live stats
              </Badge>
            )}
            {hasRealData && (
              <Badge className="text-[9px] uppercase tracking-wider bg-green-500/20 text-green-400 border-green-500/30">
                Live data — {violations.length} violations accumulated
              </Badge>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-9 text-[10px] font-bold uppercase tracking-wider"
          onClick={() => setShowExport(true)}>
          <Download className="w-3.5 h-3.5 mr-2" />{t('export_data')} (Stats)
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Vehicles', value: totalVehicles, icon: Users, color: 'text-blue-500' },
          { label: 'Total Violations', value: hasRealData ? violations.length : 42, icon: AlertCircle, color: 'text-red-500' },
          { label: 'Compliance Rate', value: `${complianceRate}%`, icon: Shield, color: 'text-green-500' },
          { label: 'Live FPS', value: stats?.fps?.toFixed(1) ?? '—', icon: Activity, color: 'text-purple-500' },
        ].map(kpi => (
          <Card key={kpi.label} className="border-border bg-card shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{kpi.label}</p>
                <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
              </div>
              <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Row 1: Traffic trend (ALWAYS STATIC) + Violation distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Traffic trend — ALWAYS static reference data */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="p-5 border-b">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" />{t('traffic_trends')}
              <Badge variant="secondary" className="text-[9px] ml-auto normal-case font-normal">Reference</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={REF_TRAFFIC}>
                <defs>
                  <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gT" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis dataKey="time" stroke="#888" fontSize={11} />
                <YAxis stroke="#888" fontSize={11} />
                <Tooltip {...TT} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Area type="monotone" dataKey="cars" name={t('cars')} stroke="#3b82f6" fill="url(#gC)" />
                <Area type="monotone" dataKey="trucks" name={t('trucks')} stroke="#f59e0b" fill="url(#gT)" />
                <Area type="monotone" dataKey="buses" name={t('buses')} stroke="#10b981" fillOpacity={0} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Violation distribution — real data when available, reference otherwise */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="p-5 border-b">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" />{t('violation_distribution')}
              {!hasRealData && <Badge variant="secondary" className="text-[9px] ml-auto normal-case font-normal">Reference</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 flex items-center h-[280px]">
            <ResponsiveContainer width="55%" height="100%">
              <PieChart>
                <Pie data={violationsByType} cx="50%" cy="50%" innerRadius={60} outerRadius={95}
                  paddingAngle={4} dataKey="value">
                  {violationsByType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip {...TT} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2.5 pl-2">
              {violationsByType.map((item, i) => (
                <div key={item.name} className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-[11px] font-medium leading-tight flex-1">{item.name}</span>
                  <span className="text-[11px] text-muted-foreground font-bold">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Violations by hour + Vehicle type */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="p-5 border-b">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Clock className="w-4 h-4 text-yellow-500" />Violations by Hour of Day
              {!hasRealData && <Badge variant="secondary" className="text-[9px] ml-auto normal-case font-normal">Reference</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={violationsByHour} barSize={8}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis dataKey="hour" stroke="#888" fontSize={9} interval={3} />
                <YAxis stroke="#888" fontSize={11} allowDecimals={false} />
                <Tooltip {...TT} />
                <Bar dataKey="violations" fill="#ef4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="p-5 border-b">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-500" />Vehicle Type Breakdown
              {!hasRealData && <Badge variant="secondary" className="text-[9px] ml-auto normal-case font-normal">Reference</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={vehicleBreakdown} layout="vertical" barSize={18}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                <XAxis type="number" stroke="#888" fontSize={11} allowDecimals={false} />
                <YAxis type="category" dataKey="name" stroke="#888" fontSize={11} width={90} />
                <Tooltip {...TT} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {vehicleBreakdown.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Per camera + Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="p-5 border-b">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-green-500" />Violations per Camera
              {!hasRealData && <Badge variant="secondary" className="text-[9px] ml-auto normal-case font-normal">Reference</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={violationsByScene} barSize={32}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis dataKey="name" stroke="#888" fontSize={11} />
                <YAxis stroke="#888" fontSize={11} allowDecimals={false} />
                <Tooltip {...TT} />
                <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="p-5 border-b">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-500" />Violation Severity Profile
              {!hasRealData && <Badge variant="secondary" className="text-[9px] ml-auto normal-case font-normal">Reference</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius={80}>
                <PolarGrid stroke="#333" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#888', fontSize: 10 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#666', fontSize: 9 }} />
                <Radar dataKey="value" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} />
                <Tooltip {...TT} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <Clock className="w-8 h-8 text-primary" />
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{t('peak_hour')}</p>
              <p className="text-2xl font-bold">{peakHour}</p>
              <p className="text-xs text-muted-foreground">{t('highest_traffic')}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <Activity className="w-8 h-8 text-green-500" />
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{t('avg_speed')}</p>
              <p className="text-2xl font-bold">42 km/h</p>
              <p className="text-xs text-muted-foreground">{t('normal_flow')}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <Shield className="w-8 h-8 text-blue-500" />
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{t('compliance_rate')}</p>
              <p className={`text-2xl font-bold ${complianceRate >= 95 ? 'text-green-400' : complianceRate >= 80 ? 'text-yellow-400' : 'text-red-400'}`}>
                {complianceRate}%
              </p>
              <p className="text-xs text-muted-foreground">{t('safety_score')}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
