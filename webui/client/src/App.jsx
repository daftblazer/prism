import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import {
  Plus, List, Cpu, Activity, Folder, X, Terminal, Square,
  RefreshCcw, CheckCircle2, Clock, AlertCircle, CornerLeftUp, HardDrive,
  Settings, Wrench, Play, Search, StopCircle, FileVideo, File, Star,
  FlaskConical, Trash2, HelpCircle, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Columns, Image, Pause,
  Music, Save, Edit3, AlertTriangle, Languages, Bell, Send
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) { return twMerge(clsx(inputs)); }
const socket = io();

// --- Helper Components ---

const SettingsPage = ({ appSettings, saveAppSettings, crtEnabled, setCrtEnabled, lightMode, setLightMode, systemMetrics }) => {
  const [releaseGroup, setReleaseGroup] = useState(appSettings?.releaseGroup || '');
  const [parallelInstances, setParallelInstances] = useState(appSettings?.parallelInstances || 1);
  const [reservedCores, setReservedCores] = useState(appSettings?.reservedCores || 0);
  const [threadsPerCCD, setThreadsPerCCD] = useState(appSettings?.threadsPerCCD || 0);
  const [threadPreview, setThreadPreview] = useState(null);
  useEffect(() => { setReleaseGroup(appSettings?.releaseGroup || ''); }, [appSettings?.releaseGroup]);
  useEffect(() => { setParallelInstances(appSettings?.parallelInstances || 1); }, [appSettings?.parallelInstances]);
  useEffect(() => { setReservedCores(appSettings?.reservedCores || 0); }, [appSettings?.reservedCores]);
  useEffect(() => { setThreadsPerCCD(appSettings?.threadsPerCCD || 0); }, [appSettings?.threadsPerCCD]);
  const handleReleaseGroupSave = () => { saveAppSettings({ releaseGroup }); };
  const handleEncodingSave = (overrides = {}) => {
    const vals = { parallelInstances: overrides.parallelInstances ?? parallelInstances, reservedCores: overrides.reservedCores ?? reservedCores, threadsPerCCD: overrides.threadsPerCCD ?? threadsPerCCD };
    saveAppSettings(vals);
  };
  useEffect(() => {
    const fetchPreview = async () => {
      try {
        const { data } = await axios.get('/api/system/thread-preview', { params: { instances: parallelInstances, reserved: reservedCores, perCCD: threadsPerCCD } });
        setThreadPreview(data);
      } catch { setThreadPreview(null); }
    };
    fetchPreview();
  }, [parallelInstances, reservedCores, threadsPerCCD]);
  const rowCls = "flex items-center justify-between py-4 border-b border-sf";
  const labelCls = "text-[14px] font-bold uppercase tracking-widest text-nerv";
  const toggleBase = "px-3 py-1.5 text-[15px] font-bold uppercase tracking-wider transition-all border";
  const toggleOff = "border-sf bg-void text-steel-dim";
  const numInputCls = "w-20 border border-sf bg-void px-3 py-1.5 text-xs font-bold text-steel font-sys text-right";
  return (
    <div className="space-y-8">
      <div>
        <h3 className="nerv-title text-nerv text-sm mb-4">General</h3>
        <div className="border border-sf bg-void-panel">
          <div className={cn(rowCls, "px-4")}>
            <div>
              <span className={labelCls}>Release Group</span>
              <p className="text-[11px] text-steel-dim mt-0.5">Tag used in file naming and track titles</p>
            </div>
            <input type="text" value={releaseGroup} onChange={e => setReleaseGroup(e.target.value)} onBlur={handleReleaseGroupSave} onKeyDown={e => e.key === 'Enter' && handleReleaseGroupSave()} placeholder="e.g. ED3N, Judas" className="w-48 border border-sf bg-void px-3 py-1.5 text-xs font-bold text-steel font-sys text-right" />
          </div>
          <div className={cn(rowCls, "px-4")}>
            <div>
              <span className={labelCls}>CRT Effects</span>
              <p className="text-[11px] text-steel-dim mt-0.5">Scanline and phosphor glow overlay</p>
            </div>
            <button onClick={() => setCrtEnabled(!crtEnabled)} className={cn(toggleBase, crtEnabled ? "border-data-green/30 bg-data-green/10 text-data-green" : toggleOff)}>
              {crtEnabled ? 'On' : 'Off'}
            </button>
          </div>
          <div className={cn(rowCls, "px-4 border-b-0")}>
            <div>
              <span className={labelCls}>Light Mode</span>
              <p className="text-[11px] text-steel-dim mt-0.5">Switch to light color scheme</p>
            </div>
            <button onClick={() => setLightMode(!lightMode)} className={cn(toggleBase, lightMode ? "border-nerv/30 bg-nerv/10 text-nerv" : toggleOff)}>
              {lightMode ? 'On' : 'Off'}
            </button>
          </div>
        </div>
      </div>
      <div>
        <h3 className="nerv-title text-nerv text-sm mb-4">Encoding</h3>
        <div className="border border-sf bg-void-panel">
          <div className={cn(rowCls, "px-4")}>
            <div>
              <span className={labelCls}>Parallel Instances</span>
              <p className="text-[11px] text-steel-dim mt-0.5">Number of simultaneous encode processes (1 = sequential)</p>
            </div>
            <input type="number" min={1} max={8} value={parallelInstances} onChange={e => { const v = Math.max(1, Math.min(8, parseInt(e.target.value) || 1)); setParallelInstances(v); }} onBlur={() => handleEncodingSave()} onKeyDown={e => e.key === 'Enter' && handleEncodingSave()} className={numInputCls} />
          </div>
          <div className={cn(rowCls, "px-4")}>
            <div>
              <span className={labelCls}>Reserved Cores</span>
              <p className="text-[11px] text-steel-dim mt-0.5">Cores reserved for host OS (reserves both thread and hyperthread, from core 0 upward)</p>
            </div>
            <input type="number" min={0} max={Math.floor((systemMetrics?.cores || 32) / 2)} value={reservedCores} onChange={e => { const v = Math.max(0, parseInt(e.target.value) || 0); setReservedCores(v); }} onBlur={() => handleEncodingSave()} onKeyDown={e => e.key === 'Enter' && handleEncodingSave()} className={numInputCls} />
          </div>
          <div className={cn(rowCls, "px-4")}>
            <div>
              <span className={labelCls}>Threads per CCD</span>
              <p className="text-[11px] text-steel-dim mt-0.5">Enable CCD-aware allocation for AMD CPUs (0 = disabled, e.g. 16 for 8-core CCDs with SMT)</p>
            </div>
            <input type="number" min={0} value={threadsPerCCD} onChange={e => { const v = Math.max(0, parseInt(e.target.value) || 0); setThreadsPerCCD(v); }} onBlur={() => handleEncodingSave()} onKeyDown={e => e.key === 'Enter' && handleEncodingSave()} className={numInputCls} />
          </div>
          {threadPreview && (
            <div className="px-4 py-4 border-t border-sf">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[12px] font-bold uppercase tracking-widest text-steel">Thread Allocation Preview</span>
                <span className="text-[10px] font-bold text-steel-dim">({threadPreview.totalThreads} threads{threadPreview.tasksetAvailable ? ', taskset available' : ', taskset unavailable'})</span>
              </div>
              {threadPreview.allocations?.length > 0 ? (
                <div className="space-y-2">
                  {threadPreview.allocations.map((alloc, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-[11px] font-bold text-nerv w-20 shrink-0">Instance {i + 1}</span>
                      <code className="text-[11px] font-bold text-data-green font-sys">{alloc.cpuList}</code>
                      <span className="text-[10px] font-bold text-steel-dim">({alloc.threadCount} threads, --lp {alloc.threadCount})</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-steel-dim">No allocations — check reserved cores count</p>
              )}
            </div>
          )}
        </div>
      </div>
      <div>
        <h3 className="nerv-title text-nerv text-sm mb-4">Maintenance</h3>
        <div className="border border-sf bg-void-panel">
          <div className={cn(rowCls, "px-4 border-b-0")}>
            <div>
              <span className={labelCls}>Clean Work Directories</span>
              <p className="text-[11px] text-steel-dim mt-0.5">Remove leftover .work- folders from failed or interrupted encodes</p>
            </div>
            <button onClick={async () => { try { const { data } = await axios.delete('/api/cleanup/work-dirs'); alert(`Removed ${data.removed} leftover work director${data.removed === 1 ? 'y' : 'ies'}`); } catch (e) { alert(e.response?.data?.error || e.message); } }} className="px-3 py-1.5 text-[15px] font-bold uppercase tracking-wider transition-all border border-sf bg-void text-steel-dim hover:border-alert-red/30 hover:bg-alert-red/10 hover:text-alert-red">
              Clean Up
            </button>
          </div>
        </div>
      </div>
      <div>
        <h3 className="nerv-title text-nerv text-sm mb-4">Notifications</h3>
        <div className="border border-sf bg-void-panel">
          {(appSettings?.webhooks || []).map((wh) => (
            <WebhookRow key={wh.id} webhook={wh} onUpdate={(updated) => {
              const webhooks = (appSettings.webhooks || []).map(w => w.id === updated.id ? updated : w);
              saveAppSettings({ webhooks });
            }} onDelete={() => {
              const webhooks = (appSettings.webhooks || []).filter(w => w.id !== wh.id);
              saveAppSettings({ webhooks });
            }} />
          ))}
          <div className={cn(rowCls, "px-4 border-b-0")}>
            <div>
              <span className={labelCls}>Add Webhook</span>
              <p className="text-[11px] text-steel-dim mt-0.5">Get notified on Discord, Slack, or any URL when encodes complete or fail</p>
            </div>
            <button onClick={() => {
              const id = 'wh-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
              const webhooks = [...(appSettings.webhooks || []), { id, name: '', url: '', enabled: true }];
              saveAppSettings({ webhooks });
            }} className={cn(toggleBase, toggleOff, "hover:border-data-green/30 hover:bg-data-green/10 hover:text-data-green")}>
              <Plus className="w-4 h-4 inline -mt-0.5 mr-1" />Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const WebhookRow = ({ webhook, onUpdate, onDelete }) => {
  const [name, setName] = useState(webhook.name);
  const [url, setUrl] = useState(webhook.url);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => { setName(webhook.name); setUrl(webhook.url); }, [webhook.name, webhook.url]);

  const save = (overrides = {}) => onUpdate({ ...webhook, name: overrides.name ?? name, url: overrides.url ?? url });
  const handleTest = async () => {
    if (!url) return;
    setTesting(true);
    setTestResult(null);
    try {
      await axios.post('/api/webhooks/test', { url });
      setTestResult('success');
    } catch (err) {
      setTestResult(err.response?.data?.error || 'Failed');
    }
    setTesting(false);
    setTimeout(() => setTestResult(null), 4000);
  };

  const inputCls = "flex-1 min-w-0 border border-sf bg-void px-3 py-1.5 text-xs font-bold text-steel font-sys";
  const rowCls = "flex items-center justify-between py-4 border-b border-sf";
  const toggleBase = "px-3 py-1.5 text-[15px] font-bold uppercase tracking-wider transition-all border";
  const toggleOff = "border-sf bg-void text-steel-dim";

  return (
    <div className="px-4 py-4 border-b border-sf space-y-3">
      <div className="flex items-center gap-3">
        <Bell className="w-4 h-4 text-nerv shrink-0" />
        <input type="text" value={name} onChange={e => setName(e.target.value)} onBlur={() => save()} onKeyDown={e => e.key === 'Enter' && save()} placeholder="Webhook name" className={cn(inputCls, "w-40 flex-none")} />
        <input type="text" value={url} onChange={e => setUrl(e.target.value)} onBlur={() => save()} onKeyDown={e => e.key === 'Enter' && save()} placeholder="https://discord.com/api/webhooks/..." className={cn(inputCls)} />
        <button onClick={handleTest} disabled={testing || !url} title="Send test notification" className={cn(toggleBase, "px-2 py-1.5 shrink-0", testing ? "border-wire-cyan/30 bg-wire-cyan/10 text-wire-cyan" : testResult === 'success' ? "border-data-green/30 bg-data-green/10 text-data-green" : testResult ? "border-alert-red/30 bg-alert-red/10 text-alert-red" : toggleOff, "hover:border-wire-cyan/30 hover:bg-wire-cyan/10 hover:text-wire-cyan disabled:opacity-50")}>
          {testing ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : testResult === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
        </button>
        <button onClick={() => onUpdate({ ...webhook, enabled: !webhook.enabled })} className={cn(toggleBase, "px-2 py-1.5 shrink-0 text-[11px]", webhook.enabled ? "border-data-green/30 bg-data-green/10 text-data-green" : toggleOff)}>
          {webhook.enabled ? 'On' : 'Off'}
        </button>
        <button onClick={onDelete} title="Remove webhook" className={cn(toggleBase, "px-2 py-1.5 shrink-0", toggleOff, "hover:border-alert-red/30 hover:bg-alert-red/10 hover:text-alert-red")}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {testResult && testResult !== 'success' && (
        <p className="text-[11px] text-alert-red font-bold ml-7">{testResult}</p>
      )}
    </div>
  );
};

const NavItem = ({ icon, label, active, onClick }) => {
  return (
    <button onClick={onClick} className={cn("w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-bold transition-all uppercase tracking-wider", active ? "text-nerv bg-nerv/10 border-l-2 border-nerv" : "text-steel-dim hover:text-nerv border-l-2 border-transparent")}>{icon}{label}</button>
  );
};

const StatChip = ({ label, value }) => {
  if (!value && value !== 0) return null;
  return (
    <div className="px-3 py-2 border border-sf bg-void-panel">
      <p className="text-[12px] font-bold uppercase tracking-widest text-nerv mb-0.5">{label}</p>
      <p className="text-xs font-bold tabular-nums text-data-green glow-green">{value}</p>
    </div>
  );
};

const formatBytes = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const SystemMetricsPanel = ({ metrics }) => {
  const cpuPercent = metrics?.cpu || 0;
  const memPercent = metrics?.mem?.percentage || 0;
  const perCore = metrics?.perCore || [];
  const coreCount = perCore.length || metrics?.cores || 0;

  return (
    <div className="panel overflow-hidden flex flex-col">
      <div className="panel-header">
        <div className="flex items-center gap-2"><Cpu className="w-3.5 h-3.5 text-nerv" /><span>System Metrics</span></div>
        <span className="tag">Central Dogma</span>
      </div>
      <div className="panel-body flex-1 min-h-0 flex flex-col overflow-auto">
        {/* CPU Section — grows to fill available space */}
        <div className="space-y-2 flex-1 min-h-0 flex flex-col">
          <div className="flex justify-between items-end">
            <div className="flex flex-col">
              <span className="text-[13px] font-bold text-nerv-dim uppercase tracking-widest">Central Processing Unit</span>
              <span className="text-[11px] font-bold text-steel font-mincho">中央処理装置</span>
            </div>
            <span className="text-3xl font-black text-data-green glow-green tabular-nums leading-none">{cpuPercent.toFixed(1)}%</span>
          </div>

          {/* Per-core horizontal bar grid */}
          {perCore.length > 0 && (
            <div className="flex-1 min-h-0 flex flex-col gap-1">
              <div className="grid grid-cols-2 gap-x-3 flex-1 min-h-0" style={{ gridAutoRows: 'minmax(14px, 1fr)' }}>
                {perCore.map((usage, i) => {
                  const barColor = usage > 90 ? 'var(--alert-red)' : usage > 70 ? 'var(--nerv-orange)' : 'var(--data-green)';
                  const glowColor = usage > 90 ? 'var(--alert-red)' : usage > 70 ? 'var(--nerv-orange)' : 'var(--data-green)';
                  return (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-steel-dim tabular-nums w-6 shrink-0">C{i}</span>
                      <div className="flex-1 h-3/4 min-h-[10px] bg-void border border-sf overflow-hidden">
                        <div
                          className="h-full transition-all duration-700 ease-out"
                          style={{
                            width: `${Math.max(usage, 1)}%`,
                            background: barColor,
                            boxShadow: usage > 20 ? `0 0 ${Math.min(usage / 15, 4)}px ${glowColor}` : 'none',
                          }}
                        />
                      </div>
                      <span className="text-[10px] font-bold tabular-nums w-8 text-right shrink-0" style={{ color: barColor }}>{usage.toFixed(0)}%</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[11px] font-bold text-steel-dim uppercase tracking-tight tabular-nums shrink-0">
                <span>{coreCount} Logical Cores</span>
                <span>Load: {metrics?.loadAvg?.[0]?.toFixed(2) || '0.00'} / {metrics?.loadAvg?.[1]?.toFixed(2) || '0.00'} / {metrics?.loadAvg?.[2]?.toFixed(2) || '0.00'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Memory Section */}
        <div className="space-y-2 pt-3 mt-3 border-t border-sf shrink-0">
          <div className="flex justify-between items-end">
            <div className="flex flex-col">
              <span className="text-[13px] font-bold text-nerv-dim uppercase tracking-widest">Main Memory Unit</span>
              <span className="text-[11px] font-bold text-steel font-mincho">主記憶装置</span>
            </div>
            <span className="text-3xl font-black text-wire-cyan glow-cyan tabular-nums leading-none">{memPercent.toFixed(1)}%</span>
          </div>
          {/* Segmented memory bar */}
          <div className="h-6 bg-void border border-sf flex gap-px p-0.5">
            {Array.from({ length: 48 }).map((_, i) => {
              const threshold = ((i + 1) / 48) * 100;
              const filled = threshold <= memPercent;
              const nearEdge = Math.abs(threshold - memPercent) < 2.5;
              return (
                <div
                  key={i}
                  className="flex-1 transition-all duration-500"
                  style={{
                    background: filled
                      ? 'var(--wire-cyan)'
                      : 'var(--steel-faint, rgba(255,255,255,0.03))',
                    opacity: filled ? (nearEdge ? 0.6 : 1) : 1,
                    boxShadow: filled ? '0 0 4px var(--wire-cyan)' : 'none',
                  }}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[11px] font-bold text-steel-dim uppercase tracking-tight tabular-nums">
            <span>Used: {formatBytes(metrics?.mem?.used)}</span>
            <span>Free: {formatBytes(metrics?.mem?.free)}</span>
            <span>Total: {formatBytes(metrics?.mem?.total)}</span>
          </div>
        </div>

        {/* Uptime — pinned to bottom */}
        {metrics?.uptime && (
          <div className="pt-3 mt-3 border-t border-sf flex justify-between items-center shrink-0">
            <span className="text-[13px] font-bold text-nerv uppercase tracking-widest">System Uptime</span>
            <span className="text-sm font-bold text-steel font-sys tabular-nums">
              {Math.floor(metrics.uptime / 86400)}d {Math.floor((metrics.uptime % 86400) / 3600)}h {Math.floor((metrics.uptime % 3600) / 60)}m
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

const MiniQueue = ({ queue, currentJob }) => {
  const nextJobs = queue.filter(j => j.id !== currentJob?.id).slice(0, 5);
  
  return (
    <div className="panel overflow-hidden">
      <div className="panel-header">
        <div className="flex items-center gap-2"><List className="w-3.5 h-3.5 text-nerv" /><span>Operation Queue</span></div>
        <span className="tag">{queue.length} Active</span>
      </div>
      <div className="panel-body p-0">
        {nextJobs.length === 0 ? (
          <div className="p-8 text-center text-[15px] font-bold text-steel-dim uppercase italic tracking-widest">
            Queue Exhausted
          </div>
        ) : (
          <div className="divide-y divide-sf">
            {nextJobs.map((job, i) => (
              <div key={job.id || i} className="p-3 flex items-start gap-3 bg-void-panel/50 hover:bg-nerv/5 transition-colors group">
                <div className="text-[14px] font-black text-nerv-dim group-hover:text-nerv mt-0.5">{i + 1}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-bold text-steel truncate uppercase tracking-tight">{job.input_folder.split('/').pop()}</div>
                  <div className="text-[12px] font-bold text-steel-dim uppercase mt-0.5">
                    CRF {job.crf} | {job.encoder.split('/').pop()}
                  </div>
                </div>
              </div>
            ))}
            {queue.length > 5 && (
              <div className="p-2 text-center text-[12px] font-bold text-nerv-dim uppercase tracking-widest bg-void">
                + {queue.length - 5} more items
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const COLOR_LABELS = {
  primaries: { '1': 'BT.709', '9': 'BT.2020', '11': 'DCI-P3', '12': 'Display P3' },
  transfer: { '1': 'BT.709', '16': 'PQ (HDR10)', '18': 'HLG', '13': 'sRGB' },
  matrix: { '1': 'BT.709', '9': 'BT.2020nc', '14': 'ICtCp' },
  range: { '0': 'Limited', '1': 'Full' },
};
const colorLabel = (type, val) => COLOR_LABELS[type]?.[val] || val;

const EncodingStatsPanel = ({ status }) => {
  const isEncoding = status?.active && status.status === 'encoding';
  const isPaused = status?.status === 'paused';
  const hasStats = isEncoding || isPaused;
  const isTestEncode = status?.testEncode;
  const currentState = isTestEncode ? 'Test Encode' : (status?.status ? status.status.charAt(0).toUpperCase() + status.status.slice(1) : 'Idle');

  const InfoCell = ({ label, value, accent }) => (
    <div className="bg-void p-2.5 border border-sf">
      <span className="text-[11px] font-bold text-steel-dim uppercase block">{label}</span>
      <span className={cn("text-[17px] font-bold", accent ? (isTestEncode ? "text-wire-cyan" : "text-data-green") : "text-steel")}>{value || '—'}</span>
    </div>
  );

  return (
    <div className="panel overflow-hidden flex flex-col">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5 text-nerv" />
          <span>Encoding Statistics</span>
          <span className="text-steel font-mincho text-[14px] ml-1">符号化統計</span>
        </div>
        <span className="tag">{currentState}</span>
      </div>
      <div className="panel-body flex-1 min-h-0 overflow-auto">
        {!hasStats ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <h4 className="text-[12px] font-bold text-nerv uppercase tracking-widest">System Status</h4>
              <div className="grid grid-cols-2 gap-1.5">
                <InfoCell label="State" value={currentState} />
                <InfoCell label="Batch Queue" value={`${status?.queueLength || 0} Queued`} />
              </div>
            </div>
            <div className="flex items-center justify-center pt-4">
              <span className="text-[14px] font-bold text-steel-dim uppercase tracking-widest">Awaiting Signal</span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <h4 className="text-[12px] font-bold text-nerv uppercase tracking-widest">Operation</h4>
              <div className="grid grid-cols-3 gap-1.5">
                <InfoCell label="State" value={currentState} accent />
                <InfoCell label="Batch Queue" value={`${status?.queueLength || 0} Queued`} />
                <InfoCell label="Frames" value={status.currentFrame && status.totalFrames ? `${status.currentFrame} / ${status.totalFrames}` : status.currentFrame || '—'} accent />
              </div>
            </div>
            <div className="space-y-1.5">
              <h4 className="text-[12px] font-bold text-nerv uppercase tracking-widest">Performance</h4>
              {status.instances?.length > 1 ? (
                <div className="grid grid-cols-3 gap-1.5">
                  <InfoCell label="Total Speed" value={(() => { const total = status.instances.reduce((sum, i) => sum + (parseFloat(i.fps) || 0), 0); return total > 0 ? `${total.toFixed(1)} fps` : null; })()} accent />
                  <InfoCell label="Instances" value={`${status.instances.length} active`} accent />
                  <InfoCell label="Completed" value={`${status.completedFiles || 0} / ${status.totalFiles || 0}`} />
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  <InfoCell label="Speed" value={status.fps ? `${status.fps} fps` : null} accent />
                  <InfoCell label="Bitrate" value={status.bitrate ? `${status.bitrate} kb/s` : null} />
                  <InfoCell label="Size" value={status.size ? `${status.size} MB${status.estSize ? ` / ~${status.estSize} MB` : ''}` : null} />
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <h4 className="text-[12px] font-bold text-nerv uppercase tracking-widest">Timing</h4>
              <div className="grid grid-cols-3 gap-1.5">
                <InfoCell label="Elapsed" value={status.elapsed} />
                <InfoCell label="Remaining" value={status.eta} />
                <InfoCell label="Crop" value={status.crop} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const MediaInfoPanel = ({ status }) => {
  const fileMeta = status?.fileMeta;
  const isEncoding = status?.active && status.status === 'encoding';
  const encoder = status?.encoder;

  return (
    <div className="panel overflow-hidden flex flex-col">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <FileVideo className="w-3.5 h-3.5 text-nerv" />
          <span>Media Intelligence</span>
          <span className="text-steel font-mincho text-[14px] ml-1">媒体情報</span>
        </div>
        {isEncoding && <span className="tag">Active</span>}
      </div>
      <div className="panel-body flex-1 min-h-0 overflow-auto">
        {(!isEncoding || !fileMeta) ? (
          <div className="h-full flex items-center justify-center">
            <span className="text-[14px] font-bold text-steel-dim uppercase tracking-widest">No Active File</span>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Video info */}
            <div className="space-y-1.5">
              <h4 className="text-[12px] font-bold text-nerv uppercase tracking-widest">Video Stream</h4>
              <div className="grid grid-cols-2 gap-1.5">
                {fileMeta.resolution && (
                  <div className="bg-void p-2 border border-sf">
                    <span className="text-[11px] font-bold text-steel-dim uppercase block">Resolution</span>
                    <span className="text-[17px] font-bold text-steel">{fileMeta.resolution}</span>
                  </div>
                )}
                {fileMeta.sourceCodec && (
                  <div className="bg-void p-2 border border-sf">
                    <span className="text-[11px] font-bold text-steel-dim uppercase block">Source Codec</span>
                    <span className="text-[17px] font-bold text-steel">{fileMeta.sourceCodec.toUpperCase()}</span>
                  </div>
                )}
                {encoder && (
                  <div className="bg-void p-2 border border-sf">
                    <span className="text-[11px] font-bold text-steel-dim uppercase block">Target Encoder</span>
                    <span className="text-[17px] font-bold text-steel">{encoder.split('/').pop()}</span>
                  </div>
                )}
                {fileMeta.sourceFps && (
                  <div className="bg-void p-2 border border-sf">
                    <span className="text-[11px] font-bold text-steel-dim uppercase block">Frame Rate</span>
                    <span className="text-[17px] font-bold text-steel">{fileMeta.sourceFps} fps</span>
                  </div>
                )}
              </div>
            </div>

            {/* Color metadata */}
            {fileMeta.color && (
              <div className="space-y-1.5">
                <h4 className="text-[12px] font-bold text-nerv uppercase tracking-widest">Color Space</h4>
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="bg-void p-2 border border-sf">
                    <span className="text-[11px] font-bold text-steel-dim uppercase block">Primaries</span>
                    <span className="text-[17px] font-bold text-wire-cyan">{colorLabel('primaries', fileMeta.color.primaries)}</span>
                  </div>
                  <div className="bg-void p-2 border border-sf">
                    <span className="text-[11px] font-bold text-steel-dim uppercase block">Transfer</span>
                    <span className="text-[17px] font-bold text-wire-cyan">{colorLabel('transfer', fileMeta.color.transfer)}</span>
                  </div>
                  <div className="bg-void p-2 border border-sf">
                    <span className="text-[11px] font-bold text-steel-dim uppercase block">Matrix</span>
                    <span className="text-[17px] font-bold text-wire-cyan">{colorLabel('matrix', fileMeta.color.matrix)}</span>
                  </div>
                  <div className="bg-void p-2 border border-sf">
                    <span className="text-[11px] font-bold text-steel-dim uppercase block">Range</span>
                    <span className="text-[17px] font-bold text-wire-cyan">{colorLabel('range', fileMeta.color.range)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Audio tracks */}
            {fileMeta.audioTracks && fileMeta.audioTracks.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-[12px] font-bold text-nerv uppercase tracking-widest">Audio Tracks</h4>
                <div className="space-y-1">
                  {fileMeta.audioTracks.map((t, i) => (
                    <div key={i} className="bg-void p-2 border border-sf flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[15px] font-bold text-steel block truncate">{t.title}</span>
                        <span className="text-[12px] font-bold text-steel-dim uppercase">{t.layout}</span>
                      </div>
                      <span className={cn("text-[12px] font-bold uppercase px-1.5 py-0.5 border shrink-0",
                        t.mode === 'copy' ? 'text-wire-cyan border-wire-cyan/30 bg-wire-cyan/5' : 'text-data-green border-data-green/30 bg-data-green/5'
                      )}>
                        {t.mode === 'copy' ? 'Passthrough' : `Encode ${t.bitrate}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const StatusCard = ({ label, value }) => {
  return (
    <div className="border border-sf p-4 bg-void-panel">
      <p className="text-[12px] font-bold uppercase tracking-widest text-nerv mb-1.5">{label}</p>
      <p className="text-sm font-bold truncate text-steel">{value}</p>
    </div>
  );
};

const Dashboard = ({ status, queue, logs, logRef, setLogs, autoScroll, setAutoScroll, systemMetrics }) => {
  const activeJob = status?.activeJob;
  const progress = status?.progress || 0;
  const isTestEncode = status?.testEncode;
  const handleScroll = () => {
    if (!logRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 60);
  };
  const pauseEncode = async () => { try { await axios.post('/api/pause'); } catch (e) { console.error(e); } };
  const stopEncode = async () => { try { await axios.post(isTestEncode ? '/api/test-encode/stop' : '/api/stop'); } catch (e) { console.error(e); } };
  const resumeEncode = async () => { try { await axios.post('/api/resume'); } catch (e) { console.error(e); } };
  const isEncoding = status?.active && status.status === 'encoding';
  const isPaused = status?.status === 'paused';
  const isIdleWithQueue = status?.status === 'idle' && queue.length > 0;
  const gridStyle = isEncoding || isPaused ? {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)',
    gridTemplateRows: '1fr 1fr',
    gridTemplateAreas: `"encode stats sidebar" "terminal mediainfo sidebar"`,
    flex: '1 1 0%',
    minHeight: 0,
    gap: '12px',
    padding: '16px',
  } : {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)',
    gridTemplateRows: '1fr 1fr',
    gridTemplateAreas: `"status stats sidebar" "terminal mediainfo sidebar"`,
    flex: '1 1 0%',
    minHeight: 0,
    gap: '12px',
    padding: '16px',
  };

  return (
    <div style={gridStyle}>
      {/* Top-left: encode panel or status cards */}
      {(isEncoding || isPaused) ? (
        <div style={{ gridArea: 'encode' }} className={cn("border bg-void-panel min-h-0 flex flex-col overflow-hidden", isTestEncode ? "border-wire-cyan-dim/30" : "border-data-green-dim/30")}>
          {/* Header row: status badges + controls */}
          <div className="flex items-center justify-between px-5 pt-4 pb-2 gap-3">
            <div className="flex items-center gap-2">
              {isTestEncode && <FlaskConical className="w-3.5 h-3.5 text-wire-cyan" />}
              <span className={cn("text-[12px] font-bold uppercase tracking-widest px-2 py-0.5 border", isTestEncode ? "border-wire-cyan-dim/30 text-wire-cyan bg-wire-cyan/5" : "border-data-green-dim/30 text-data-green bg-data-green/5")}>
                {isTestEncode ? 'Test Encode' : (status?.status ? status.status.charAt(0).toUpperCase() + status.status.slice(1) : 'Idle')}
              </span>
              {!isTestEncode && (
                <span className="text-[12px] font-bold uppercase tracking-widest px-2 py-0.5 border border-sf text-steel-dim">
                  {`${status?.queueLength || 0} Queued`}
                </span>
              )}
              {isEncoding && !isTestEncode && (
                <span className="text-[12px] font-bold text-data-green">
                  {status.instances?.length > 1
                    ? `${status.completedFiles || 0} / ${status.totalFiles || 0} files (${status.instances.length} parallel)`
                    : (status.fileIndex && status.totalFiles ? `File ${status.fileIndex} of ${status.totalFiles}` : 'Starting...')}
                  {status.phase === 'muxing' && ' — Muxing'}
                </span>
              )}
              {isEncoding && isTestEncode && (
                <span className="text-[12px] font-bold text-wire-cyan">
                  {status.phaseLabel || status.phase}
                  {status.variantIndex > 0 && ` (${status.variantIndex} of ${status.totalVariants})`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isPaused && !isTestEncode && (
                <button onClick={resumeEncode} title="Resume encoding" className="flex items-center gap-2 px-4 py-2 font-bold text-xs bg-nerv text-black hover:bg-nerv-hot transition-all active:scale-95 uppercase tracking-wider"><Play className="w-3.5 h-3.5" /> Resume</button>
              )}
              {isEncoding && !isTestEncode && (
                <button onClick={pauseEncode} title="Pause encoding" className="p-2 bg-nerv/15 text-nerv hover:bg-nerv hover:text-black transition-all active:scale-95"><Pause className="w-4 h-4" /></button>
              )}
              <button onClick={stopEncode} title={isTestEncode ? "Stop test encode" : "Stop and remove from queue"} className="p-2 bg-alert-red/15 text-alert-red hover:bg-alert-red hover:text-black transition-all active:scale-95"><Square className="w-4 h-4" /></button>
            </div>
          </div>
          {/* Title — full width, allowed to wrap */}
          <div className="px-5 pb-3">
            <h3 className="text-lg font-bold text-steel leading-snug break-words">{activeJob?.name || 'Encode Operation'}</h3>
            {isEncoding && status?.instances?.length === 1 && status.instances[0].currentFile && (
              <p className="text-sm font-bold text-steel-dim mt-1 truncate">{status.instances[0].currentFile}</p>
            )}
            {isPaused && !isTestEncode && <p className="text-sm font-bold text-nerv-dim mt-1">Job is waiting to resume</p>}
          </div>
          {/* Multi-instance cards */}
          {isEncoding && status?.instances?.length > 1 ? (
            <div className="flex-1 min-h-0 overflow-auto px-5 space-y-1.5">
              {status.instances.map((inst, i) => (
                <div key={inst.slotIndex} className="border border-sf bg-void p-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold text-nerv uppercase shrink-0">[{inst.slotIndex}]</span>
                      <span className="text-[12px] font-bold text-steel truncate">{inst.currentFile || 'Starting...'}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {inst.fps && <span className="text-[11px] font-bold text-data-green tabular-nums">{inst.fps} fps</span>}
                      <span className="text-[11px] font-bold text-data-green tabular-nums w-12 text-right">{(inst.progress || 0).toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-void border border-sf overflow-hidden">
                    <div className="h-full bg-data-green transition-all duration-500 ease-out" style={{ width: `${inst.progress || 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1" />
          )}
          {/* Overall progress section at bottom */}
          {isEncoding && (
            <div className="px-5 pb-4 pt-2 space-y-2">
              <div className="flex items-end justify-between">
                <span className="text-[12px] font-bold uppercase tracking-widest text-steel-dim">
                  {status?.instances?.length > 1 ? `Overall (${status.instances.length} instances)` : 'Progress'}
                </span>
                <p className={cn("text-4xl font-black tabular-nums leading-none", isTestEncode ? "text-wire-cyan glow-cyan" : "text-data-green glow-green")}>{progress.toFixed(1)}%</p>
              </div>
              <div className="w-full h-2.5 bg-void border border-sf overflow-hidden">
                <div className={cn("h-full transition-all duration-500 ease-out", isTestEncode ? "bg-wire-cyan" : "bg-data-green")} style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ gridArea: 'status' }} className="min-h-0 flex flex-col border border-sf bg-void-panel">
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <span className="text-[14px] font-bold uppercase tracking-widest text-nerv mb-1">All Systems Standing By</span>
            <span className="text-xs font-bold text-steel font-mincho">全系統待機中</span>
            <span className="text-[12px] font-bold uppercase tracking-widest text-steel-dim mt-4">No Active Encode Operations</span>
          </div>
          {isIdleWithQueue && (
            <div className="border-t border-sf p-5">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="nerv-title text-nerv text-base">Queue Ready</h3>
                  <p className="text-[15px] font-bold mt-1 text-steel-dim">{queue.length} job{queue.length !== 1 ? 's' : ''} waiting</p>
                </div>
                <button onClick={resumeEncode} title="Start processing queue" className="flex items-center gap-2 px-4 py-2.5 font-bold text-xs bg-nerv text-black hover:bg-nerv-hot transition-all active:scale-95 uppercase tracking-wider"><Play className="w-3.5 h-3.5" /> Start</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Center column: waveform + media info */}
      <div style={{ gridArea: 'stats' }} className="min-h-0 flex flex-col [&>*]:flex-1">
        <EncodingStatsPanel status={status} />
      </div>
      <div style={{ gridArea: 'mediainfo' }} className="min-h-0 flex flex-col [&>*]:flex-1">
        <MediaInfoPanel status={status} />
      </div>

      {/* Right column: metrics + queue */}
      <div style={{ gridArea: 'sidebar' }} className="min-h-0 overflow-auto flex flex-col gap-3 [&>*]:flex-1 [&>*]:min-h-0">
        <SystemMetricsPanel metrics={systemMetrics} />
        <MiniQueue queue={queue} currentJob={activeJob} />
      </div>

      {/* Bottom-left: terminal log — fills remaining height */}
      <div style={{ gridArea: 'terminal' }} className="panel overflow-hidden flex flex-col min-h-0">
        <div className="panel-header">
          <div className="flex items-center gap-2"><Terminal className="w-3.5 h-3.5 text-nerv" /><span>Terminal Log</span></div>
          <div className="flex items-center gap-3">
            {!autoScroll && <button onClick={() => setAutoScroll(true)} className="text-[14px] font-bold uppercase text-wire-cyan hover:text-wire-cyan/80 transition-colors">Resume Scroll</button>}
            <button onClick={() => setLogs([])} className="text-[14px] font-bold uppercase text-steel-dim hover:text-steel transition-colors">Clear</button>
          </div>
        </div>
        <div ref={logRef} onScroll={handleScroll} className="flex-1 p-4 overflow-auto font-sys text-[17px] leading-relaxed text-data-green-dim min-h-0">
          {logs.length === 0 && <p className="text-steel-dim/50 italic uppercase tracking-widest text-[12px]">[PRISM] Awaiting telemetry feed...</p>}
          {logs.map((log, i) => {
            const entry = typeof log === 'string' ? { type: 'info', text: log } : log;
            const colorClass = entry.type === 'encode' ? 'text-data-green' : entry.type === 'init' ? 'text-wire-cyan' : entry.type === 'error' ? 'text-alert-red' : entry.type === 'stderr' ? 'text-nerv' : 'text-steel';
            const borderClass = entry.type === 'encode' ? 'border-data-green/30' : entry.type === 'init' ? 'border-wire-cyan/30' : entry.type === 'error' ? 'border-alert-red/30' : 'border-sf';
            return <pre key={i} className={cn("mb-1 border-l-2 pl-3 py-0.5 hover:bg-steel/[0.03] whitespace-pre-wrap font-sys text-[13px] leading-snug", colorClass, borderClass)}>{entry.text}</pre>;
          })}
        </div>
      </div>

    </div>
  );
};

const QueueSection = ({ queue }) => {
  const clearQueue = async () => { try { await axios.post('/api/queue/clear'); } catch (e) { console.error(e); } };
  const removeJob = async (id) => { try { await axios.delete(`/api/queue/${id}`); } catch (e) { console.error(e); } };
  const moveJob = async (id, direction) => { try { await axios.post(`/api/queue/${id}/move`, { direction }); } catch (e) { console.error(e); } };
  const [expandedId, setExpandedId] = useState(null);
  const tagCls = "text-[11px] font-bold uppercase px-1.5 py-0.5 border border-sf text-steel-dim";
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="nerv-title text-nerv text-sm">Pending Jobs ({queue.length})</h3>
        {queue.length > 0 && (
          <button onClick={clearQueue} className="flex items-center gap-2 px-3 py-2 text-[15px] font-bold bg-alert-red/15 text-alert-red hover:bg-alert-red hover:text-black transition-all active:scale-95 uppercase tracking-wider">
            <Trash2 className="w-3.5 h-3.5" /> Clear Queue
          </button>
        )}
      </div>
      {queue.length === 0 ? (
        <div className="border-2 border-dashed border-sf py-16 flex flex-col items-center justify-center bg-void text-steel-dim">
          <Clock className="w-12 h-12 mb-3 opacity-50" />
          <p className="font-bold uppercase tracking-widest text-xs">No Jobs Scheduled</p>
        </div>
      ) : (
        <div className="grid gap-2">{queue.map((batch, i) => (
          <div key={batch.id || i} className="border border-sf bg-void-panel">
            <div className="p-4 flex items-center gap-4">
              <div className="flex flex-col gap-0.5">
                <button onClick={() => moveJob(batch.id, 'up')} disabled={i === 0} title="Move up" className={cn("p-0.5 transition-all", i === 0 ? "text-steel-dim/20 cursor-not-allowed" : "text-steel-dim hover:text-nerv")}><ChevronUp className="w-4 h-4" /></button>
                <button onClick={() => moveJob(batch.id, 'down')} disabled={i === queue.length - 1} title="Move down" className={cn("p-0.5 transition-all", i === queue.length - 1 ? "text-steel-dim/20 cursor-not-allowed" : "text-steel-dim hover:text-nerv")}><ChevronDown className="w-4 h-4" /></button>
              </div>
              <div className="w-9 h-9 bg-nerv/10 flex items-center justify-center shrink-0"><Folder className="w-4 h-4 text-nerv" /></div>
              <div className="flex-1 min-w-0" onClick={() => setExpandedId(expandedId === batch.id ? null : batch.id)} style={{ cursor: 'pointer' }}>
                <h4 className="font-bold text-sm truncate text-steel">{batch.input_folder}</h4>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className={tagCls}>{batch.encoder.split('/').pop()}</span>
                  <span className={tagCls}>CRF {batch.crf}</span>
                  <span className={tagCls}>P{batch.preset}</span>
                  <span className={tagCls}>T{batch.tune || 0}</span>
                  {batch.subfolder && <span className="text-[11px] font-bold uppercase px-1.5 py-0.5 border border-wire-cyan/30 text-wire-cyan">{batch.subfolder}</span>}
                  {batch.auto_crop && <span className="text-[11px] font-bold uppercase px-1.5 py-0.5 border border-data-green/30 text-data-green">Crop</span>}
                  {batch.rename_audio && <span className="text-[11px] font-bold uppercase px-1.5 py-0.5 border border-data-green/30 text-data-green">Rename Audio</span>}
                </div>
              </div>
              {batch.id && <button onClick={() => removeJob(batch.id)} title="Remove from queue" className="p-1.5 text-steel-dim hover:text-alert-red transition-all"><X className="w-3.5 h-3.5" /></button>}
            </div>
            {expandedId === batch.id && (
              <div className="border-t border-sf px-4 py-3 grid grid-cols-2 gap-x-8 gap-y-2">
                <div><span className="text-[11px] font-bold text-steel-dim uppercase block">Input</span><span className="text-[12px] font-bold text-steel break-all">{batch.input_folder}</span></div>
                <div><span className="text-[11px] font-bold text-steel-dim uppercase block">Encoder</span><span className="text-[12px] font-bold text-steel">{batch.encoder}</span></div>
                <div><span className="text-[11px] font-bold text-steel-dim uppercase block">CRF / Preset / Tune</span><span className="text-[12px] font-bold text-steel">{batch.crf} / {batch.preset} / {batch.tune || 0}</span></div>
                <div><span className="text-[11px] font-bold text-steel-dim uppercase block">Output Subfolder</span><span className="text-[12px] font-bold text-steel">{batch.subfolder || '—'}</span></div>
                <div><span className="text-[11px] font-bold text-steel-dim uppercase block">Custom Flags</span><span className="text-[12px] font-bold text-steel font-sys">{batch.custom_flags || '—'}</span></div>
                <div><span className="text-[11px] font-bold text-steel-dim uppercase block">Options</span><span className="text-[12px] font-bold text-steel">{[batch.auto_crop && 'Auto-Crop', batch.rename_audio && 'Rename Audio'].filter(Boolean).join(', ') || '—'}</span></div>
                {batch.addedAt && <div><span className="text-[11px] font-bold text-steel-dim uppercase block">Added</span><span className="text-[12px] font-bold text-steel">{new Date(batch.addedAt).toLocaleString()}</span></div>}
              </div>
            )}
          </div>
        ))}</div>
      )}
    </div>
  );
};

const ENCODER_DESCRIPTIONS = {
  '5fish': { title: '5fish PSY', description: 'SVT-AV1 fork best tuned for anime content. Psychovisual optimizations deliver superior visual fidelity on animated sources at lower bitrates, with custom tune modes and bias controls.', repo: 'github.com/5fish/svt-av1-psy' },
  'hdr': { title: 'HDR', description: 'SVT-AV1 fork optimized for live-action and HDR content. Includes improvements for high dynamic range encoding, tone mapping, and perceptual quality tuning for real-world footage.', repo: 'github.com/juliobbv-p/svt-av1-hdr' },
  'essential': { title: 'Essential', description: 'Easy-to-use SVT-AV1 fork that works well for any content. Provides a stable, opinionated build with sensible defaults and curated quality-of-life improvements.', repo: 'github.com/nekotrix/SVT-AV1-Essential' },
};

const EncodersSection = ({ encoders, buildEncoder, buildLogs }) => {
  const [selectedEncoder, setSelectedEncoder] = useState(encoders[0]?.name || null);
  const [branches, setBranches] = useState({});
  const [selectedBranches, setSelectedBranches] = useState({});
  const [loadingBranches, setLoadingBranches] = useState({});
  const buildLogRef = useRef(null);

  useEffect(() => {
    encoders.forEach(enc => {
      if (branches[enc.name]) return;
      setLoadingBranches(prev => ({ ...prev, [enc.name]: true }));
      axios.get(`/api/encoders/${enc.name}/branches`)
        .then(res => {
          setBranches(prev => ({ ...prev, [enc.name]: res.data.branches }));
          setSelectedBranches(prev => ({ ...prev, [enc.name]: res.data.defaultBranch }));
        })
        .catch(() => {
          setBranches(prev => ({ ...prev, [enc.name]: [enc.defaultBranch || 'main'] }));
          setSelectedBranches(prev => ({ ...prev, [enc.name]: enc.defaultBranch || 'main' }));
        })
        .finally(() => setLoadingBranches(prev => ({ ...prev, [enc.name]: false })));
    });
  }, [encoders]);

  // Auto-scroll build log
  useEffect(() => {
    if (buildLogRef.current) {
      buildLogRef.current.scrollTop = buildLogRef.current.scrollHeight;
    }
  }, [buildLogs]);

  const selectedEnc = encoders.find(e => e.name === selectedEncoder);
  const info = ENCODER_DESCRIPTIONS[selectedEncoder] || { title: selectedEncoder, description: 'No description available.', repo: '' };

  // Collect all build logs into a unified stream
  const allBuildLogs = Object.entries(buildLogs).flatMap(([name, logs]) =>
    logs.map(line => ({ name, line }))
  );

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gridTemplateRows: '1fr 1fr',
      gridTemplateAreas: `"list info" "list terminal"`,
      flex: '1 1 0%',
      minHeight: 0,
      gap: '12px',
      padding: '16px',
    }}>
      {/* Left column: encoder list */}
      <div style={{ gridArea: 'list' }} className="flex flex-col gap-2 min-h-0 overflow-auto">
        {encoders.map(enc => {
          const isSelected = enc.name === selectedEncoder;
          const encBranch = selectedBranches[enc.name] || enc.defaultBranch || 'main';
          const encBranches = branches[enc.name] || [];
          const isLoading = loadingBranches[enc.name];
          return (
            <div key={enc.name} onClick={() => setSelectedEncoder(enc.name)} className={cn("border bg-void-panel cursor-pointer transition-all", isSelected ? "border-nerv" : "border-sf hover:border-steel-dim")}>
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-nerv/10 flex items-center justify-center"><Cpu className="w-3.5 h-3.5 text-nerv" /></div>
                    <div>
                      <h4 className="nerv-title text-nerv text-sm">{enc.name}</h4>
                      <p className="text-[11px] font-bold text-steel-dim uppercase tracking-wider">{enc.isInstalled ? 'Binary Ready' : 'Build Required'}</p>
                    </div>
                  </div>
                  {enc.isInstalled ? <CheckCircle2 className="w-4 h-4 text-data-green" /> : <AlertCircle className="w-4 h-4 text-nerv" />}
                </div>
                <div className="flex gap-2">
                  <select value={encBranch} onChange={e => { e.stopPropagation(); setSelectedBranches(prev => ({ ...prev, [enc.name]: e.target.value })); }} onClick={e => e.stopPropagation()} disabled={isLoading} className="flex-1 border border-sf bg-void px-2 py-1.5 text-[11px] font-bold text-steel font-sys min-w-0">
                    {isLoading ? <option>Loading...</option> : encBranches.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <button onClick={e => { e.stopPropagation(); buildEncoder(enc.name, encBranch); }} className="px-3 py-1.5 font-bold text-[11px] flex items-center gap-1.5 active:scale-95 transition-all text-black bg-nerv hover:bg-nerv-hot uppercase tracking-wider shrink-0">
                    <RefreshCcw className="w-3 h-3" /> {enc.isInstalled ? 'Rebuild' : 'Build'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Top-right: encoder description */}
      <div style={{ gridArea: 'info' }} className="border border-sf bg-void-panel min-h-0 flex flex-col">
        <div className="panel-header">
          <div className="flex items-center gap-2"><Cpu className="w-3.5 h-3.5 text-nerv" /><span>{info.title}</span></div>
          {selectedEnc && (
            <span className={cn("text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 border", selectedEnc.isInstalled ? "border-data-green/30 text-data-green bg-data-green/5" : "border-nerv/30 text-nerv bg-nerv/5")}>
              {selectedEnc.isInstalled ? 'Installed' : 'Not Installed'}
            </span>
          )}
        </div>
        <div className="flex-1 p-5 overflow-auto">
          <p className="text-sm text-steel leading-relaxed mb-4">{info.description}</p>
          {info.repo && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-widest text-nerv">Source</span>
              <span className="text-[12px] font-bold text-steel-dim font-sys">{info.repo}</span>
            </div>
          )}
          {selectedEnc && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[11px] font-bold uppercase tracking-widest text-nerv">Binary</span>
              <span className="text-[12px] font-bold text-steel-dim font-sys truncate">{selectedEnc.path}</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom-right: unified build terminal */}
      <div style={{ gridArea: 'terminal' }} className="panel overflow-hidden flex flex-col min-h-0">
        <div className="panel-header">
          <div className="flex items-center gap-2"><Terminal className="w-3.5 h-3.5 text-nerv" /><span>Build Output</span></div>
        </div>
        <div ref={buildLogRef} className="flex-1 p-4 overflow-auto font-sys text-[13px] leading-relaxed text-data-green-dim min-h-0">
          {allBuildLogs.length === 0 && <p className="text-steel-dim/50 italic uppercase tracking-widest text-[12px]">[PRISM] Awaiting build commands...</p>}
          {allBuildLogs.map((entry, i) => (
            <div key={i} className="mb-0.5 whitespace-pre-wrap"><span className="text-nerv">[{entry.name}]</span> {entry.line}</div>
          ))}
        </div>
      </div>
    </div>
  );
};

const FileBrowser = ({ currentPath, onNavigate, onSelect, onFileSelect, selectedFile, items, loading, favorites, onToggleFavorite, header }) => {
  const isFav = (p) => (favorites || []).includes(p);
  const toggleFav = async (e, dirPath) => {
    e.stopPropagation();
    if (onToggleFavorite) onToggleFavorite(dirPath);
  };
  const favDirs = (favorites || []).filter(f => f !== currentPath);

  return (
    <>
      {header}
      <div className="px-4 py-3 border-b border-sf flex items-center gap-3 text-xs font-bold font-sys truncate bg-void-panel text-steel-dim">
        <HardDrive className="w-4 h-4 shrink-0 text-nerv" /> <span className="truncate">{currentPath}</span>
        {currentPath !== '/' && (
          <button onClick={(e) => toggleFav(e, currentPath)} title={isFav(currentPath) ? 'Remove from favorites' : 'Add to favorites'} className={cn("ml-auto shrink-0 p-1 transition-all", isFav(currentPath) ? "text-nerv" : "text-steel-dim hover:text-nerv")}>
            <Star className="w-3.5 h-3.5" fill={isFav(currentPath) ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-0.5">
        {currentPath !== '/' && (
          <button onClick={() => onNavigate(currentPath.substring(0, currentPath.lastIndexOf('/')) || '/')} className="w-full flex items-center gap-3 px-3 py-3 font-bold text-[15px] uppercase tracking-widest mb-3 border border-sf hover:bg-steel/[0.05] text-steel-dim"><CornerLeftUp className="w-4 h-4" /> Go Back</button>
        )}
        {favDirs.length > 0 && (
          <div className="mb-3">
            <p className="text-[12px] font-bold uppercase tracking-widest px-3 mb-1.5 text-nerv-dim">Favorites</p>
            {favDirs.map(fav => (
              <div key={fav} onClick={() => { onNavigate(fav); if (onSelect) onSelect(fav); }} className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-xs font-bold group transition-all hover:bg-nerv/10 active:scale-[0.98] cursor-pointer text-steel">
                <Star className="w-3.5 h-3.5 shrink-0 text-nerv group-hover:text-nerv-hot" fill="currentColor" />
                <span className="truncate flex-1">{fav}</span>
                <button onClick={(e) => toggleFav(e, fav)} className="opacity-0 group-hover:opacity-100 shrink-0 p-1 text-steel-dim hover:text-alert-red transition-all" title="Remove from favorites"><X className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        )}
        {loading ? <div className="p-16 text-center font-bold animate-pulse uppercase tracking-wider text-nerv text-xs">Scanning...</div> : (<>
          {items.filter(i => i.isDirectory).map(item => (
            <div key={item.path} className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-xs font-bold group transition-all hover:bg-nerv/10 active:scale-[0.98] cursor-pointer text-steel" onClick={() => { onNavigate(item.path); if (onSelect) onSelect(item.path); }}>
              <Folder className="w-4 h-4 shrink-0 text-nerv group-hover:text-nerv-hot" />
              <span className="truncate flex-1">{item.name}</span>
              <button onClick={(e) => toggleFav(e, item.path)} className={cn("shrink-0 p-1 transition-all", isFav(item.path) ? "text-nerv" : "opacity-0 group-hover:opacity-100 text-steel-dim hover:text-nerv")} title={isFav(item.path) ? 'Remove from favorites' : 'Add to favorites'}>
                <Star className="w-3.5 h-3.5" fill={isFav(item.path) ? 'currentColor' : 'none'} />
              </button>
            </div>
          ))}
          {items.filter(i => !i.isDirectory).map(item => {
            const isVideo = /\.(mkv|mp4|avi|mov|wmv|ts|m2ts)$/i.test(item.name);
            const Icon = isVideo ? FileVideo : File;
            const sizeStr = item.size >= 1073741824 ? `${(item.size / 1073741824).toFixed(1)} GB` : item.size >= 1048576 ? `${(item.size / 1048576).toFixed(0)} MB` : `${(item.size / 1024).toFixed(0)} KB`;
            const canSelect = onFileSelect && isVideo;
            const isSelected = selectedFile === item.path;
            return (
              <div key={item.path} onClick={canSelect ? () => onFileSelect(item.path) : undefined} className={cn("w-full flex items-center gap-3 px-3 py-2 text-xs", canSelect ? cn("cursor-pointer transition-all hover:bg-wire-cyan/10 active:scale-[0.98]", isSelected && "bg-wire-cyan/10 border-l-2 border-wire-cyan text-wire-cyan") : "text-steel-dim/50")}>
                <Icon className={cn("w-3.5 h-3.5 shrink-0", canSelect && isSelected && "text-wire-cyan")} /> <span className="truncate flex-1">{item.name}</span> <span className="text-[14px] font-sys shrink-0 text-steel-dim">{sizeStr}</span>
              </div>
            );
          })}
        </>)}
      </div>
    </>
  );
};

const AddBatchModal = ({ onClose, encoders, onSuccess, favorites, toggleFavorite }) => {
  const [formData, setFormData] = useState({ encoder: encoders[0]?.path || '', crf: '18', preset: '4', tune: '0', custom_flags: '', subfolder: '', auto_crop: false, rename_audio: false });
  const [path, setPath] = useState('/');
  const [selectedFile, setSelectedFile] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { browse(path); }, [path]);
  const browse = async (p) => { setLoading(true); try { const res = await axios.get(`/api/browse?path=${encodeURIComponent(p)}`); setItems(res.data); } catch (e) { console.error(e); } finally { setLoading(false); } };
  const handleFileSelect = (filePath) => { setSelectedFile(prev => prev === filePath ? null : filePath); };
  const inputTarget = selectedFile || path;
  const handleSubmit = async (e) => {
    e.preventDefault(); if (inputTarget === '/') return alert('Select a folder or video file first!');
    try { await axios.post('/api/queue', { ...formData, input_folder: inputTarget }); onSuccess(); } catch (e) { alert(e.message); }
  };

  const inputCls = "w-full border border-sf bg-void p-3 text-xs font-bold text-steel font-sys";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/90">
      <div className="border border-sf w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col bg-void-panel shadow-[0_0_60px_rgba(255,152,48,0.05)]">
        <div className="px-6 py-4 border-b border-sf flex justify-between items-center bg-void">
          <h3 className="nerv-title text-nerv text-lg">Add to Queue</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-steel-dim hover:text-alert-red transition-all"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-auto flex">
          <div className="w-1/2 border-r border-sf flex flex-col bg-void">
            <FileBrowser currentPath={path} onNavigate={(p) => { setPath(p); setSelectedFile(null); }} onFileSelect={handleFileSelect} selectedFile={selectedFile} items={items} loading={loading} favorites={favorites} onToggleFavorite={toggleFavorite} />
          </div>
          <form onSubmit={handleSubmit} className="w-1/2 p-8 space-y-6 bg-void-panel">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><label className="text-[14px] font-bold uppercase tracking-widest text-nerv">Encoder Choice</label><select value={formData.encoder} onChange={e=>setFormData({...formData, encoder:e.target.value})} className={inputCls}>{encoders.map(e=><option key={e.path} value={e.path}>{e.name}</option>)}</select></div>
              <div className="space-y-1.5"><label className="text-[14px] font-bold uppercase tracking-widest text-nerv">CRF Level</label><input type="number" value={formData.crf} onChange={e=>setFormData({...formData, crf:e.target.value})} className={inputCls} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><label className="text-[14px] font-bold uppercase tracking-widest text-nerv">Preset (0-13)</label><input type="number" value={formData.preset} onChange={e=>setFormData({...formData, preset:e.target.value})} className={inputCls} /></div>
              <div className="space-y-1.5"><label className="text-[14px] font-bold uppercase tracking-widest text-nerv">Tune (0-4)</label><input type="number" value={formData.tune} onChange={e=>setFormData({...formData, tune:e.target.value})} className={inputCls} /></div>
            </div>
            <div className="space-y-1.5"><label className="text-[14px] font-bold uppercase tracking-widest text-nerv">Output Subfolder</label><input type="text" value={formData.subfolder} onChange={e=>setFormData({...formData, subfolder:e.target.value})} placeholder="e.g. encodes" className={inputCls} /></div>
            <div className="space-y-1.5"><label className="text-[14px] font-bold uppercase tracking-widest text-nerv">Extra Encoder Flags</label><input type="text" value={formData.custom_flags} onChange={e=>setFormData({...formData, custom_flags:e.target.value})} placeholder="e.g. --lineart-psy-bias 3" className={inputCls} /></div>
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={formData.auto_crop} onChange={e=>setFormData({...formData, auto_crop:e.target.checked})} className="w-4 h-4 accent-nerv" /><span className="text-xs font-bold text-steel">Auto-Crop Black Bars</span></label>
              <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={formData.rename_audio} onChange={e=>setFormData({...formData, rename_audio:e.target.checked})} className="w-4 h-4 accent-nerv" /><span className="text-xs font-bold text-steel">Rename Audio Tracks</span></label>
            </div>
            <button type="submit" disabled={inputTarget==='/'} className="w-full py-4 font-bold text-sm transition-all active:scale-[0.98] uppercase tracking-wider text-black disabled:opacity-30 bg-nerv hover:bg-nerv-hot">{selectedFile ? 'Encode Single File' : 'Add Batch to Queue'}</button>
          </form>
        </div>
      </div>
    </div>
  );
};

const AUDIO_TAB_TOOL_IDS = ['swap_audio_order', 'shift_audio_offset', 'set_default_audio', 'strip_compat_audio', 'keep_japanese_audio', 'mux_in_english', 'mux_commentary', 'rename_tracks', 'mux_audio_tracks'];

const AUDIO_TOOL_STRIP_IDS = ['set_default_audio', 'swap_audio_order', 'shift_audio_offset', 'mux_audio_tracks'];

const SUBTITLE_TAB_TOOL_IDS = ['swap_subtitle_order', 'shift_subtitles_offset', 'set_default_subtitle', 'rename_subtitles'];
const SUBTITLE_TOOL_STRIP_IDS = ['set_default_subtitle', 'swap_subtitle_order', 'shift_subtitles_offset'];

const AudioScanner = ({ favorites, toggleFavorite, toolLogs, setToolLogs, toolStatus, toolLogRef, appSettings }) => {
  const [browsePath, setBrowsePath] = useState('/');
  const [browseItems, setBrowseItems] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [selectedDir, setSelectedDir] = useState('');
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState(null);
  const [expandedFile, setExpandedFile] = useState(null);
  const [editedNames, setEditedNames] = useState({});
  const [saving, setSaving] = useState({});
  const [checkedTracks, setCheckedTracks] = useState({});
  const [removing, setRemoving] = useState({});
  const [audioTools, setAudioTools] = useState([]);
  const [activeTool, setActiveTool] = useState(null);
  const [toolEnv, setToolEnv] = useState({});
  const [activePathVar, setActivePathVar] = useState(null);
  const [toolAutoScroll, setToolAutoScroll] = useState(true);
  // Mux tool: probe source dir
  const [muxSourceTracks, setMuxSourceTracks] = useState([]);
  const [muxSelectedIndices, setMuxSelectedIndices] = useState({});
  const [muxTrackNames, setMuxTrackNames] = useState({});
  const [probingMuxSource, setProbingMuxSource] = useState(false);
  // set_default_audio: probe tracks
  const [defaultAudioTracks, setDefaultAudioTracks] = useState([]);
  const [probingDefault, setProbingDefault] = useState(false);

  useEffect(() => {
    setBrowseLoading(true);
    axios.get(`/api/browse?path=${encodeURIComponent(browsePath)}`).then(r => setBrowseItems(r.data)).catch(console.error).finally(() => setBrowseLoading(false));
  }, [browsePath]);

  useEffect(() => {
    axios.get('/api/tools').then(r => {
      setAudioTools(r.data.filter(t => AUDIO_TOOL_STRIP_IDS.includes(t.id)));
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (toolAutoScroll && toolLogRef.current) toolLogRef.current.scrollTop = toolLogRef.current.scrollHeight;
  }, [toolLogs, toolAutoScroll, toolLogRef]);

  // Probe for set_default_audio when dir changes and that tool is active
  useEffect(() => {
    if (activeTool?.id !== 'set_default_audio' || !selectedDir) { setDefaultAudioTracks([]); return; }
    setProbingDefault(true);
    axios.get(`/api/tools/probe?path=${encodeURIComponent(selectedDir)}`)
      .then(res => {
        const tracks = (res.data.tracks || []).filter(t => t.type === 'audio').map((t, i) => ({
          index: i + 1, lang: t.properties?.language || 'und', name: t.properties?.track_name || '',
          codec: t.codec || '', channels: t.properties?.audio_channels || '?',
        }));
        setDefaultAudioTracks(tracks);
        if (tracks.length > 0) setToolEnv(prev => ({ ...prev, AUDIO_CHOICE: prev.AUDIO_CHOICE || String(tracks[0].index) }));
      })
      .catch(() => setDefaultAudioTracks([]))
      .finally(() => setProbingDefault(false));
  }, [activeTool?.id, selectedDir]);

  const handleScan = async () => {
    if (!selectedDir) return;
    setScanning(true);
    setResults(null);
    setExpandedFile(null);
    setEditedNames({});
    setCheckedTracks({});
    try {
      const res = await axios.get(`/api/audio-scanner/scan?dir=${encodeURIComponent(selectedDir)}`);
      setResults(res.data);
      // Init all tracks as checked
      const checks = {};
      res.data.files.forEach(f => { checks[f.path] = {}; f.audioTracks.forEach(t => { checks[f.path][t.id] = true; }); });
      setCheckedTracks(checks);
    } catch (e) { alert(e.response?.data?.error || e.message); }
    finally { setScanning(false); }
  };

  const handleExpand = (filePath) => {
    if (expandedFile === filePath) { setExpandedFile(null); return; }
    setExpandedFile(filePath);
    const file = results?.files?.find(f => f.path === filePath);
    if (file) {
      const names = {};
      file.audioTracks.forEach(t => { names[t.index] = t.name; });
      setEditedNames(prev => ({ ...prev, [filePath]: names }));
    }
  };

  const handleNameChange = (filePath, trackIndex, value) => {
    setEditedNames(prev => ({ ...prev, [filePath]: { ...(prev[filePath] || {}), [trackIndex]: value } }));
  };

  const handleSave = async (filePath) => {
    const names = editedNames[filePath];
    if (!names) return;
    const tracks = Object.entries(names).map(([index, name]) => ({ index: Number(index), name }));
    setSaving(prev => ({ ...prev, [filePath]: true }));
    try {
      await axios.post('/api/audio-scanner/rename', { file: filePath, tracks });
      setResults(prev => {
        if (!prev) return prev;
        const files = prev.files.map(f => f.path === filePath ? { ...f, audioTracks: f.audioTracks.map(t => ({ ...t, name: names[t.index] ?? t.name })) } : f);
        return { ...prev, files };
      });
    } catch (e) { alert(e.response?.data?.error || e.message); }
    finally { setSaving(prev => ({ ...prev, [filePath]: false })); }
  };

  const handleSaveAll = async () => {
    if (!results || !expandedFile) return;
    const names = editedNames[expandedFile];
    if (!names) return;
    const allFiles = results.files;
    if (!confirm(`Apply these track names to all ${allFiles.length} files?`)) return;
    setSaving(prev => ({ ...prev, _all: true }));
    try {
      for (const f of allFiles) {
        const tracks = Object.entries(names)
          .filter(([idx]) => Number(idx) <= f.audioTracks.length)
          .map(([index, name]) => ({ index: Number(index), name }));
        if (tracks.length === 0) continue;
        await axios.post('/api/audio-scanner/rename', { file: f.path, tracks });
      }
      setResults(prev => {
        if (!prev) return prev;
        const files = prev.files.map(f => ({
          ...f,
          audioTracks: f.audioTracks.map(t => ({ ...t, name: names[t.index] ?? t.name })),
        }));
        return { ...prev, files };
      });
    } catch (e) { alert(e.response?.data?.error || e.message); }
    finally { setSaving(prev => ({ ...prev, _all: false })); }
  };

  const hasChanges = (filePath) => {
    const file = results?.files?.find(f => f.path === filePath);
    const names = editedNames[filePath];
    if (!file || !names) return false;
    return file.audioTracks.some(t => names[t.index] !== undefined && names[t.index] !== t.name);
  };

  const toggleTrackCheck = (filePath, trackId) => {
    setCheckedTracks(prev => ({ ...prev, [filePath]: { ...(prev[filePath] || {}), [trackId]: !(prev[filePath]?.[trackId]) } }));
  };

  const getUncheckedCount = (filePath) => {
    const checks = checkedTracks[filePath];
    if (!checks) return 0;
    return Object.values(checks).filter(v => !v).length;
  };

  const handleRemoveTracks = async (filePath) => {
    const checks = checkedTracks[filePath];
    if (!checks) return;
    const keepIds = Object.entries(checks).filter(([, v]) => v).map(([id]) => Number(id));
    if (keepIds.length === 0) return alert('Cannot remove all audio tracks');
    setRemoving(prev => ({ ...prev, [filePath]: true }));
    try {
      await axios.post('/api/audio-scanner/remove-tracks', { file: filePath, keepTrackIds: keepIds });
      await handleScan(); // rescan to reflect changes
    } catch (e) { alert(e.response?.data?.error || e.message); }
    finally { setRemoving(prev => ({ ...prev, [filePath]: false })); }
  };

  const handleRemoveAll = async () => {
    if (!results || !expandedFile) return;
    const checks = checkedTracks[expandedFile];
    if (!checks) return;
    // Get which indices (0-based position) are checked
    const file = results.files.find(f => f.path === expandedFile);
    if (!file) return;
    const keepIndices = file.audioTracks.map((t, i) => checks[t.id] ? i : -1).filter(i => i >= 0);
    if (keepIndices.length === 0) return alert('Cannot remove all audio tracks');
    const allFiles = results.files.map(f => f.path);
    if (!confirm(`Remove unchecked track positions from all ${allFiles.length} files?`)) return;
    setRemoving(prev => ({ ...prev, _all: true }));
    try {
      await axios.post('/api/audio-scanner/remove-tracks', { files: allFiles, keepIndices });
      await handleScan();
    } catch (e) { alert(e.response?.data?.error || e.message); }
    finally { setRemoving(prev => ({ ...prev, _all: false })); }
  };

  // Tool strip
  const selectTool = (tool) => {
    if (activeTool?.id === tool.id) { setActiveTool(null); setActivePathVar(null); return; }
    setActiveTool(tool);
    const init = {};
    const pathVars = tool.envVars.filter(v => v.type === 'path');
    tool.envVars.forEach(v => {
      if (v.type === 'path') {
        // Auto-fill first path var from selectedDir
        if (v === pathVars[0]) init[v.name] = selectedDir;
        else init[v.name] = v.default || '';
      } else if (v.name === 'VIDEO_NAME' && appSettings?.releaseGroup) init[v.name] = `${appSettings.releaseGroup} AV1`;
      else init[v.name] = v.default || '';
    });
    setToolEnv(init);
    setActivePathVar(pathVars.length > 1 ? pathVars[0].name : null);
    setMuxSourceTracks([]);
    setMuxSelectedIndices({});
    setMuxTrackNames({});
  };

  const handleBrowseNav = (p) => {
    setBrowsePath(p);
    if (!activeTool || !activePathVar) {
      setSelectedDir(p);
    } else {
      setToolEnv(prev => ({ ...prev, [activePathVar]: p }));
    }
  };

  const handleBrowseSelect = (p) => {
    if (!activeTool || !activePathVar) {
      setSelectedDir(p);
    } else {
      setToolEnv(prev => ({ ...prev, [activePathVar]: p }));
    }
  };

  const probeMuxSource = async () => {
    const sourceDir = toolEnv.SOURCE_DIR;
    if (!sourceDir) return;
    setProbingMuxSource(true);
    try {
      const res = await axios.get(`/api/tools/probe?path=${encodeURIComponent(sourceDir)}`);
      const tracks = (res.data.tracks || []).filter(t => t.type === 'audio').map((t, i) => ({
        index: i, id: t.id, lang: t.properties?.language || 'und', name: t.properties?.track_name || '',
        codec: t.codec || '', channels: t.properties?.audio_channels || '?',
      }));
      setMuxSourceTracks(tracks);
    } catch (e) { setMuxSourceTracks([]); alert(e.response?.data?.error || e.message); }
    finally { setProbingMuxSource(false); }
  };

  const handleRunTool = async () => {
    if (!activeTool) return;
    const env = { ...toolEnv };
    // For mux_audio_tracks, build TRACK_INDICES and TRACK_NAMES from selections
    if (activeTool.id === 'mux_audio_tracks') {
      const indices = Object.entries(muxSelectedIndices).filter(([, v]) => v).map(([k]) => k);
      if (indices.length === 0) return alert('Select at least one track to mux');
      env.TRACK_INDICES = indices.join(',');
      env.TRACK_NAMES = indices.map(i => muxTrackNames[i] || '').join('|');
      if (!env.TARGET_DIR) env.TARGET_DIR = selectedDir;
    }
    // Auto-fill DIR from selectedDir for single-dir tools
    const tool = activeTool;
    const dirVar = tool.envVars.find(v => v.type === 'path');
    if (dirVar && !env[dirVar.name]) env[dirVar.name] = selectedDir;

    Object.keys(env).forEach(k => { if (env[k] === '') delete env[k]; });
    setToolLogs([]);
    try {
      await axios.post(`/api/tools/${tool.id}/run`, { env });
    } catch (e) { alert(e.response?.data?.error || e.message); }
  };

  const stopTool = async () => { try { await axios.post(`/api/tools/${activeTool?.id || 'unknown'}/stop`); } catch (e) { console.error(e); } };

  const langLabel = (code) => ({ eng: 'English', jpn: 'Japanese', und: 'Undefined', ger: 'German', deu: 'German', fre: 'French', fra: 'French', spa: 'Spanish', ita: 'Italian', por: 'Portuguese', rus: 'Russian', kor: 'Korean', zho: 'Chinese', chi: 'Chinese', ara: 'Arabic' }[code] || code);
  const inputCls = "w-full border border-sf bg-void p-2.5 text-xs font-bold text-steel font-sys";

  const toolPathVars = activeTool ? activeTool.envVars.filter(v => v.type === 'path') : [];
  const toolNonPathVars = activeTool ? activeTool.envVars.filter(v => v.type !== 'path' && v.name !== 'DRY_RUN' && v.name !== 'TRACK_INDICES' && v.name !== 'TRACK_NAMES') : [];

  return (
    <div className="flex gap-4 h-[calc(100vh-8rem)]">
      {/* File Browser */}
      <div className="w-80 shrink-0 border border-sf flex flex-col bg-void overflow-hidden">
        <div className="px-4 py-3 border-b border-sf bg-void-panel">
          <h3 className="text-[12px] font-bold uppercase tracking-widest text-nerv">
            {activePathVar ? `Select: ${activeTool?.envVars.find(v => v.name === activePathVar)?.label || activePathVar}` : 'Select Directory'}
          </h3>
        </div>
        {toolPathVars.length > 1 && (
          <div className="px-3 py-2 border-b border-sf flex gap-1.5 flex-wrap bg-void-panel">
            {toolPathVars.map(v => (
              <button key={v.name} onClick={() => setActivePathVar(v.name)} className={cn("px-2 py-1 text-[14px] font-bold uppercase transition-all", activePathVar === v.name ? "bg-nerv text-black" : "bg-void border border-sf text-steel-dim hover:text-nerv")}>{v.label.replace(' Directory', '')}</button>
            ))}
          </div>
        )}
        <FileBrowser currentPath={browsePath} onNavigate={handleBrowseNav} onSelect={handleBrowseSelect} items={browseItems} loading={browseLoading} favorites={favorites} onToggleFavorite={toggleFavorite} />
        <div className="p-3 border-t border-sf bg-void-panel space-y-2">
          <div className="text-[14px] font-sys font-bold text-steel-dim truncate">{selectedDir || 'No directory selected'}</div>
          <button onClick={handleScan} disabled={!selectedDir || scanning} className={cn("w-full flex items-center justify-center gap-2 py-2.5 font-bold text-xs transition-all active:scale-95 tracking-wider uppercase", !selectedDir || scanning ? "bg-steel-dim/30 text-steel-dim cursor-not-allowed" : "bg-nerv text-black hover:bg-nerv-hot")}>
            <Search className="w-3.5 h-3.5" /> {scanning ? 'Scanning...' : 'Scan Audio Tracks'}
          </button>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
        {/* Scan Results */}
        <div className="flex-1 border border-sf flex flex-col bg-void-panel overflow-hidden min-h-0">
          <div className="px-4 py-3 border-b border-sf flex items-center justify-between bg-void shrink-0">
            <div className="flex items-center gap-3">
              <h3 className="text-[12px] font-bold uppercase tracking-widest text-nerv">Scan Results</h3>
              {results && <span className="text-[14px] font-sys font-bold text-steel-dim">{results.totalFiles} files — baseline: {results.baseline} audio tracks</span>}
            </div>
            {results && results.extraCount > 0 && (
              <span className="flex items-center gap-1.5 text-[14px] font-bold uppercase px-2.5 py-1 bg-nerv/15 text-nerv">
                <AlertTriangle className="w-3 h-3" /> {results.extraCount} with extra tracks
              </span>
            )}
          </div>
          <div className="flex-1 overflow-auto">
            {!results && !scanning && <div className="flex items-center justify-center h-full text-steel-dim/50 text-xs font-bold uppercase tracking-widest">Select a directory and scan to analyze audio tracks</div>}
            {scanning && <div className="flex items-center justify-center h-full text-nerv text-xs font-bold uppercase tracking-widest animate-pulse">Scanning files...</div>}
            {results && results.files.map(file => (
              <div key={file.path} className={cn("border-b border-sf", file.hasExtra && "bg-nerv/[0.03]")}>
                <div onClick={() => handleExpand(file.path)} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-steel/[0.05] transition-all">
                  <FileVideo className={cn("w-4 h-4 shrink-0", file.hasExtra ? "text-nerv" : "text-steel-dim")} />
                  <span className="flex-1 text-xs font-bold text-steel truncate">{file.name}</span>
                  <span className={cn("text-[14px] font-bold font-sys tabular-nums", file.hasExtra ? "text-nerv" : "text-steel-dim")}>{file.audioTracks.length} track{file.audioTracks.length !== 1 ? 's' : ''}</span>
                  {file.hasExtra && <span className="text-[14px] font-bold uppercase px-2 py-0.5 bg-nerv/15 text-nerv">Extra</span>}
                  {file.hasFewer && <span className="text-[14px] font-bold uppercase px-2 py-0.5 bg-wire-cyan/15 text-wire-cyan">Fewer</span>}
                  <ChevronDown className={cn("w-3.5 h-3.5 text-steel-dim transition-transform", expandedFile === file.path && "rotate-180")} />
                </div>
                {expandedFile === file.path && (
                  <div className="px-4 pb-4 space-y-2">
                    <div className="border border-sf bg-void">
                      <div className="grid grid-cols-[32px_40px_1fr_1fr_100px_60px] gap-0 text-[14px] font-bold uppercase tracking-widest text-nerv px-3 py-2 border-b border-sf">
                        <span></span><span>#</span><span>Language</span><span>Track Name</span><span>Codec</span><span>Ch</span>
                      </div>
                      {file.audioTracks.map((track, i) => {
                        const isExtra = i >= results.baseline;
                        const isChecked = checkedTracks[file.path]?.[track.id] ?? true;
                        return (
                          <div key={track.index} className={cn("grid grid-cols-[32px_40px_1fr_1fr_100px_60px] gap-0 items-center px-3 py-2 border-b border-sf last:border-b-0", isExtra && "bg-nerv/[0.06]", !isChecked && "opacity-40")}>
                            <input type="checkbox" checked={isChecked} onChange={() => toggleTrackCheck(file.path, track.id)} className="w-4 h-4 accent-nerv" />
                            <span className={cn("text-[14px] font-bold font-sys", isExtra ? "text-nerv" : "text-steel-dim")}>{track.index}</span>
                            <span className="text-xs font-bold text-steel">{langLabel(track.language)} <span className="text-steel-dim">({track.language})</span></span>
                            <input type="text" value={editedNames[file.path]?.[track.index] ?? track.name} onChange={e => handleNameChange(file.path, track.index, e.target.value)} placeholder="(no name)" className={cn("border bg-void px-2 py-1.5 text-xs font-bold font-sys text-steel w-full", isExtra ? "border-nerv/30" : "border-sf")} />
                            <span className="text-[14px] font-sys text-steel-dim">{track.codec}</span>
                            <span className="text-[14px] font-sys text-steel-dim">{track.channels}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <button onClick={() => handleSave(file.path)} disabled={!hasChanges(file.path) || saving[file.path]} className={cn("flex items-center gap-2 px-3 py-2 text-[15px] font-bold uppercase transition-all", hasChanges(file.path) ? "bg-nerv text-black hover:bg-nerv-hot" : "bg-steel-dim/20 text-steel-dim cursor-not-allowed")}>
                        <Save className="w-3 h-3" /> {saving[file.path] ? 'Saving...' : 'Save Names'}
                      </button>
                      {hasChanges(file.path) && (
                        <button onClick={handleSaveAll} disabled={saving._all} className="flex items-center gap-2 px-3 py-2 text-[15px] font-bold uppercase border border-nerv/50 text-nerv hover:bg-nerv/10 transition-all">
                          {saving._all ? 'Applying...' : 'Apply Names to All Files'}
                        </button>
                      )}
                      {getUncheckedCount(file.path) > 0 && (<>
                        <button onClick={() => handleRemoveTracks(file.path)} disabled={removing[file.path]} className="flex items-center gap-2 px-3 py-2 text-[15px] font-bold uppercase bg-alert-red/90 text-white hover:bg-alert-red transition-all">
                          <Trash2 className="w-3 h-3" /> {removing[file.path] ? 'Removing...' : `Remove ${getUncheckedCount(file.path)} Unchecked`}
                        </button>
                        <button onClick={handleRemoveAll} disabled={removing._all} className="flex items-center gap-2 px-3 py-2 text-[15px] font-bold uppercase border border-alert-red/50 text-alert-red hover:bg-alert-red/10 transition-all">
                          {removing._all ? 'Applying...' : 'Apply to All Files'}
                        </button>
                      </>)}
                      {hasChanges(file.path) && !saving._all && <span className="text-[14px] text-nerv-dim font-bold">Unsaved changes</span>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Tool Strip + Inline Params */}
        <div className="shrink-0 border border-sf bg-void-panel overflow-hidden">
          <div className="px-4 py-2.5 border-b border-sf flex items-center gap-2 flex-wrap bg-void">
            <span className="text-[12px] font-bold uppercase tracking-widest text-nerv mr-2">Tools</span>
            {audioTools.map(tool => (
              <button key={tool.id} onClick={() => selectTool(tool)} className={cn("px-3 py-1.5 text-[14px] font-bold uppercase tracking-wider transition-all", activeTool?.id === tool.id ? "bg-nerv text-black" : "bg-void-panel border border-sf text-steel-dim hover:text-nerv hover:border-nerv-dim/30")}>
                {tool.name}
              </button>
            ))}
          </div>
          {activeTool && (
            <div className="p-4 space-y-3 border-b border-sf">
              <p className="text-[14px] text-steel-dim">{activeTool.description}</p>
              {/* Path vars as read-only displays */}
              {toolPathVars.map(v => (
                <div key={v.name} className="flex items-center gap-3">
                  <span className="text-[14px] font-bold uppercase tracking-widest text-nerv w-40 shrink-0">{v.label}</span>
                  <div className="flex-1 border border-sf bg-void px-2.5 py-1.5 text-xs font-bold font-sys text-steel-dim truncate cursor-pointer hover:border-nerv-dim/30" onClick={() => { setActivePathVar(v.name); if (toolEnv[v.name]) setBrowsePath(toolEnv[v.name]); }}>
                    {toolEnv[v.name] || '(click to select)'}
                  </div>
                </div>
              ))}
              {/* Non-path vars */}
              <div className="grid grid-cols-2 gap-3">
                {toolNonPathVars.map(v => (
                  <div key={v.name} className="space-y-1">
                    <label className="text-[14px] font-bold uppercase tracking-widest text-nerv">{v.label}</label>
                    {activeTool.id === 'set_default_audio' && v.name === 'AUDIO_CHOICE' ? (
                      probingDefault ? (
                        <div className="px-3 py-2.5 text-xs font-bold border border-sf bg-void text-steel-dim">Scanning...</div>
                      ) : defaultAudioTracks.length > 0 ? (
                        <select value={toolEnv.AUDIO_CHOICE || ''} onChange={e => setToolEnv(prev => ({ ...prev, AUDIO_CHOICE: e.target.value }))} className={inputCls}>
                          {defaultAudioTracks.map(t => <option key={t.index} value={String(t.index)}>Track {t.index}: {t.lang} — {t.name || '(no name)'} ({t.codec}, {t.channels}ch)</option>)}
                        </select>
                      ) : (
                        <div className="px-3 py-2.5 text-xs font-bold border border-sf bg-void text-steel-dim">Select a directory first</div>
                      )
                    ) : v.type === 'boolean' ? (
                      <button onClick={() => setToolEnv(prev => ({ ...prev, [v.name]: prev[v.name] === '1' ? '0' : '1' }))} className={cn("px-3 py-2.5 text-xs font-bold border transition-all w-full text-left", toolEnv[v.name] === '1' ? "border-data-green/30 bg-data-green/10 text-data-green" : "border-sf bg-void text-steel-dim")}>
                        {toolEnv[v.name] === '1' ? 'Enabled' : 'Disabled'}
                      </button>
                    ) : (
                      <input type={v.type === 'number' ? 'number' : 'text'} value={toolEnv[v.name] || ''} onChange={e => setToolEnv(prev => ({ ...prev, [v.name]: e.target.value }))} placeholder={v.default || ''} className={inputCls} />
                    )}
                  </div>
                ))}
              </div>
              {/* Mux tool: source track selection */}
              {activeTool.id === 'mux_audio_tracks' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <button onClick={probeMuxSource} disabled={!toolEnv.SOURCE_DIR || probingMuxSource} className={cn("flex items-center gap-2 px-3 py-2 text-[15px] font-bold uppercase border transition-all", toolEnv.SOURCE_DIR ? "border-sf bg-void text-steel hover:text-nerv hover:border-nerv-dim/30" : "border-sf bg-void text-steel-dim cursor-not-allowed")}>
                      <Search className="w-3 h-3" /> {probingMuxSource ? 'Probing...' : 'Probe Source Tracks'}
                    </button>
                  </div>
                  {muxSourceTracks.length > 0 && (
                    <div className="border border-sf bg-void">
                      <div className="grid grid-cols-[32px_40px_1fr_1fr_100px_60px] gap-0 text-[14px] font-bold uppercase tracking-widest text-nerv px-3 py-2 border-b border-sf">
                        <span></span><span>#</span><span>Language</span><span>Name / New Name</span><span>Codec</span><span>Ch</span>
                      </div>
                      {muxSourceTracks.map(t => (
                        <div key={t.index} className="grid grid-cols-[32px_40px_1fr_1fr_100px_60px] gap-0 items-center px-3 py-2 border-b border-sf last:border-b-0">
                          <input type="checkbox" checked={!!muxSelectedIndices[t.index]} onChange={() => setMuxSelectedIndices(prev => ({ ...prev, [t.index]: !prev[t.index] }))} className="w-4 h-4 accent-nerv" />
                          <span className="text-[14px] font-bold font-sys text-steel-dim">{t.index + 1}</span>
                          <span className="text-xs font-bold text-steel">{langLabel(t.lang)} <span className="text-steel-dim">({t.lang})</span></span>
                          <input type="text" value={muxTrackNames[t.index] ?? t.name} onChange={e => setMuxTrackNames(prev => ({ ...prev, [t.index]: e.target.value }))} placeholder={t.name || '(set name)'} className="border border-sf bg-void px-2 py-1.5 text-xs font-bold font-sys text-steel w-full" />
                          <span className="text-[14px] font-sys text-steel-dim">{t.codec}</span>
                          <span className="text-[14px] font-sys text-steel-dim">{t.channels}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {/* Action bar */}
              <div className="flex items-center gap-3 pt-1">
                <button onClick={() => setToolEnv(prev => ({ ...prev, DRY_RUN: prev.DRY_RUN === '1' ? '0' : '1' }))} className={cn("flex items-center gap-2 px-3 py-2.5 text-[15px] font-bold uppercase border transition-all", toolEnv.DRY_RUN === '1' ? "border-nerv/30 bg-nerv/10 text-nerv" : "border-sf bg-void text-steel-dim")}>
                  {toolEnv.DRY_RUN === '1' ? 'Dry Run On' : 'Dry Run Off'}
                </button>
                <button onClick={handleRunTool} disabled={toolStatus?.running} className={cn("flex items-center gap-2 px-6 py-2.5 text-[15px] font-bold uppercase transition-all active:scale-[0.98]", toolStatus?.running ? "bg-steel-dim/30 text-steel-dim cursor-not-allowed" : "bg-nerv text-black hover:bg-nerv-hot")}>
                  <Play className="w-3.5 h-3.5" /> {toolStatus?.running ? 'Running...' : 'Run'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Tool Output */}
        {(toolLogs.length > 0 || toolStatus?.running) && (
          <div className="shrink-0 border border-sf overflow-hidden flex flex-col h-[250px] bg-void-panel">
            <div className="px-4 py-2 border-b border-sf flex items-center justify-between bg-void shrink-0">
              <div className="flex items-center gap-2"><Terminal className="w-3.5 h-3.5 text-nerv" /><span className="text-[12px] font-bold uppercase tracking-widest text-nerv">Tool Output</span></div>
              <div className="flex items-center gap-3">
                {toolStatus?.running && <button onClick={stopTool} className="flex items-center gap-1.5 text-[14px] font-bold uppercase text-alert-red hover:text-alert-red/80 transition-colors"><StopCircle className="w-3 h-3" /> Stop</button>}
                {!toolAutoScroll && <button onClick={() => setToolAutoScroll(true)} className="text-[14px] font-bold uppercase text-wire-cyan transition-colors">Resume Scroll</button>}
                <button onClick={() => setToolLogs([])} className="text-[14px] font-bold uppercase text-steel-dim hover:text-steel transition-colors">Clear</button>
              </div>
            </div>
            <div ref={toolLogRef} onScroll={() => { if (!toolLogRef.current) return; const { scrollTop, scrollHeight, clientHeight } = toolLogRef.current; setToolAutoScroll(scrollHeight - scrollTop - clientHeight < 60); }} className="flex-1 p-4 overflow-auto font-sys text-[17px] leading-relaxed whitespace-pre-wrap text-data-green-dim">
              {toolLogs.length === 0 && <p className="text-steel-dim/50 italic">Waiting for output...</p>}
              {toolLogs.map((log, i) => <div key={i} className={cn("mb-0.5", log.includes('[Process exited') ? (log.includes('code 0') ? 'text-data-green' : 'text-alert-red') : '')}>{log}</div>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const SubtitleScanner = ({ favorites, toggleFavorite, toolLogs, setToolLogs, toolStatus, toolLogRef, appSettings }) => {
  const [browsePath, setBrowsePath] = useState('/');
  const [browseItems, setBrowseItems] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [selectedDir, setSelectedDir] = useState('');
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState(null);
  const [expandedFile, setExpandedFile] = useState(null);
  const [editedNames, setEditedNames] = useState({});
  const [saving, setSaving] = useState({});
  const [checkedTracks, setCheckedTracks] = useState({});
  const [removing, setRemoving] = useState({});
  const [subTools, setSubTools] = useState([]);
  const [activeTool, setActiveTool] = useState(null);
  const [toolEnv, setToolEnv] = useState({});
  const [activePathVar, setActivePathVar] = useState(null);
  const [toolAutoScroll, setToolAutoScroll] = useState(true);
  const [defaultSubTracks, setDefaultSubTracks] = useState([]);
  const [probingDefault, setProbingDefault] = useState(false);

  useEffect(() => {
    setBrowseLoading(true);
    axios.get(`/api/browse?path=${encodeURIComponent(browsePath)}`).then(r => setBrowseItems(r.data)).catch(console.error).finally(() => setBrowseLoading(false));
  }, [browsePath]);

  useEffect(() => {
    axios.get('/api/tools').then(r => {
      setSubTools(r.data.filter(t => SUBTITLE_TOOL_STRIP_IDS.includes(t.id)));
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (toolAutoScroll && toolLogRef.current) toolLogRef.current.scrollTop = toolLogRef.current.scrollHeight;
  }, [toolLogs, toolAutoScroll, toolLogRef]);

  useEffect(() => {
    if (activeTool?.id !== 'set_default_subtitle' || !selectedDir) { setDefaultSubTracks([]); return; }
    setProbingDefault(true);
    axios.get(`/api/tools/probe?path=${encodeURIComponent(selectedDir)}`)
      .then(res => {
        const tracks = (res.data.tracks || []).filter(t => t.type === 'subtitles').map((t, i) => ({
          index: i + 1, lang: t.properties?.language || 'und', name: t.properties?.track_name || '',
          codec: t.codec || '', forced: !!t.properties?.forced_track,
        }));
        setDefaultSubTracks(tracks);
        if (tracks.length > 0) setToolEnv(prev => ({ ...prev, SUB_CHOICE: prev.SUB_CHOICE || String(tracks[0].index) }));
      })
      .catch(() => setDefaultSubTracks([]))
      .finally(() => setProbingDefault(false));
  }, [activeTool?.id, selectedDir]);

  const handleScan = async () => {
    if (!selectedDir) return;
    setScanning(true);
    setResults(null);
    setExpandedFile(null);
    setEditedNames({});
    setCheckedTracks({});
    try {
      const res = await axios.get(`/api/subtitle-scanner/scan?dir=${encodeURIComponent(selectedDir)}`);
      setResults(res.data);
      const checks = {};
      res.data.files.forEach(f => { checks[f.path] = {}; f.subtitleTracks.forEach(t => { checks[f.path][t.id] = true; }); });
      setCheckedTracks(checks);
    } catch (e) { alert(e.response?.data?.error || e.message); }
    finally { setScanning(false); }
  };

  const handleExpand = (filePath) => {
    if (expandedFile === filePath) { setExpandedFile(null); return; }
    setExpandedFile(filePath);
    const file = results?.files?.find(f => f.path === filePath);
    if (file) {
      const names = {};
      file.subtitleTracks.forEach(t => { names[t.index] = t.name; });
      setEditedNames(prev => ({ ...prev, [filePath]: names }));
    }
  };

  const handleNameChange = (filePath, trackIndex, value) => {
    setEditedNames(prev => ({ ...prev, [filePath]: { ...(prev[filePath] || {}), [trackIndex]: value } }));
  };

  const handleSave = async (filePath) => {
    const names = editedNames[filePath];
    if (!names) return;
    const tracks = Object.entries(names).map(([index, name]) => ({ index: Number(index), name }));
    setSaving(prev => ({ ...prev, [filePath]: true }));
    try {
      await axios.post('/api/subtitle-scanner/rename', { file: filePath, tracks });
      setResults(prev => {
        if (!prev) return prev;
        const files = prev.files.map(f => f.path === filePath ? { ...f, subtitleTracks: f.subtitleTracks.map(t => ({ ...t, name: names[t.index] ?? t.name })) } : f);
        return { ...prev, files };
      });
    } catch (e) { alert(e.response?.data?.error || e.message); }
    finally { setSaving(prev => ({ ...prev, [filePath]: false })); }
  };

  const handleSaveAll = async () => {
    if (!results || !expandedFile) return;
    const names = editedNames[expandedFile];
    if (!names) return;
    // names is keyed by 1-based track index — apply same index→name mapping to all files
    const allFiles = results.files;
    if (!confirm(`Apply these track names to all ${allFiles.length} files?`)) return;
    setSaving(prev => ({ ...prev, _all: true }));
    try {
      for (const f of allFiles) {
        const tracks = Object.entries(names)
          .filter(([idx]) => Number(idx) <= f.subtitleTracks.length)
          .map(([index, name]) => ({ index: Number(index), name }));
        if (tracks.length === 0) continue;
        await axios.post('/api/subtitle-scanner/rename', { file: f.path, tracks });
      }
      // Update local state
      setResults(prev => {
        if (!prev) return prev;
        const files = prev.files.map(f => ({
          ...f,
          subtitleTracks: f.subtitleTracks.map(t => ({ ...t, name: names[t.index] ?? t.name })),
        }));
        return { ...prev, files };
      });
    } catch (e) { alert(e.response?.data?.error || e.message); }
    finally { setSaving(prev => ({ ...prev, _all: false })); }
  };

  const hasChanges = (filePath) => {
    const file = results?.files?.find(f => f.path === filePath);
    const names = editedNames[filePath];
    if (!file || !names) return false;
    return file.subtitleTracks.some(t => names[t.index] !== undefined && names[t.index] !== t.name);
  };

  const toggleTrackCheck = (filePath, trackId) => {
    setCheckedTracks(prev => ({ ...prev, [filePath]: { ...(prev[filePath] || {}), [trackId]: !(prev[filePath]?.[trackId]) } }));
  };

  const getUncheckedCount = (filePath) => {
    const checks = checkedTracks[filePath];
    if (!checks) return 0;
    return Object.values(checks).filter(v => !v).length;
  };

  const handleRemoveTracks = async (filePath) => {
    const checks = checkedTracks[filePath];
    if (!checks) return;
    const keepIds = Object.entries(checks).filter(([, v]) => v).map(([id]) => Number(id));
    if (keepIds.length === 0) return alert('Cannot remove all subtitle tracks');
    setRemoving(prev => ({ ...prev, [filePath]: true }));
    try {
      await axios.post('/api/subtitle-scanner/remove-tracks', { file: filePath, keepTrackIds: keepIds });
      await handleScan();
    } catch (e) { alert(e.response?.data?.error || e.message); }
    finally { setRemoving(prev => ({ ...prev, [filePath]: false })); }
  };

  const handleRemoveAll = async () => {
    if (!results || !expandedFile) return;
    const checks = checkedTracks[expandedFile];
    if (!checks) return;
    const file = results.files.find(f => f.path === expandedFile);
    if (!file) return;
    const keepIndices = file.subtitleTracks.map((t, i) => checks[t.id] ? i : -1).filter(i => i >= 0);
    if (keepIndices.length === 0) return alert('Cannot remove all subtitle tracks');
    const allFiles = results.files.map(f => f.path);
    if (!confirm(`Remove unchecked track positions from all ${allFiles.length} files?`)) return;
    setRemoving(prev => ({ ...prev, _all: true }));
    try {
      await axios.post('/api/subtitle-scanner/remove-tracks', { files: allFiles, keepIndices });
      await handleScan();
    } catch (e) { alert(e.response?.data?.error || e.message); }
    finally { setRemoving(prev => ({ ...prev, _all: false })); }
  };

  const selectTool = (tool) => {
    if (activeTool?.id === tool.id) { setActiveTool(null); setActivePathVar(null); return; }
    setActiveTool(tool);
    const init = {};
    const pathVars = tool.envVars.filter(v => v.type === 'path');
    tool.envVars.forEach(v => {
      if (v.type === 'path') {
        if (v === pathVars[0]) init[v.name] = selectedDir;
        else init[v.name] = v.default || '';
      } else init[v.name] = v.default || '';
    });
    setToolEnv(init);
    setActivePathVar(pathVars.length > 1 ? pathVars[0].name : null);
  };

  const handleBrowseNav = (p) => {
    setBrowsePath(p);
    if (!activeTool || !activePathVar) {
      setSelectedDir(p);
    } else {
      setToolEnv(prev => ({ ...prev, [activePathVar]: p }));
    }
  };

  const handleBrowseSelect = (p) => {
    if (!activeTool || !activePathVar) {
      setSelectedDir(p);
    } else {
      setToolEnv(prev => ({ ...prev, [activePathVar]: p }));
    }
  };

  const handleRunTool = async () => {
    if (!activeTool) return;
    const env = { ...toolEnv };
    const tool = activeTool;
    const dirVar = tool.envVars.find(v => v.type === 'path');
    if (dirVar && !env[dirVar.name]) env[dirVar.name] = selectedDir;
    Object.keys(env).forEach(k => { if (env[k] === '') delete env[k]; });
    setToolLogs([]);
    try {
      await axios.post(`/api/tools/${tool.id}/run`, { env });
    } catch (e) { alert(e.response?.data?.error || e.message); }
  };

  const stopTool = async () => { try { await axios.post(`/api/tools/${activeTool?.id || 'unknown'}/stop`); } catch (e) { console.error(e); } };

  const langLabel = (code) => ({ eng: 'English', jpn: 'Japanese', und: 'Undefined', ger: 'German', deu: 'German', fre: 'French', fra: 'French', spa: 'Spanish', ita: 'Italian', por: 'Portuguese', rus: 'Russian', kor: 'Korean', zho: 'Chinese', chi: 'Chinese', ara: 'Arabic' }[code] || code);
  const inputCls = "w-full border border-sf bg-void p-2.5 text-xs font-bold text-steel font-sys";

  const toolPathVars = activeTool ? activeTool.envVars.filter(v => v.type === 'path') : [];
  const toolNonPathVars = activeTool ? activeTool.envVars.filter(v => v.type !== 'path' && v.name !== 'DRY_RUN') : [];

  return (
    <div className="flex gap-4 h-[calc(100vh-8rem)]">
      {/* File Browser */}
      <div className="w-80 shrink-0 border border-sf flex flex-col bg-void overflow-hidden">
        <div className="px-4 py-3 border-b border-sf bg-void-panel">
          <h3 className="text-[12px] font-bold uppercase tracking-widest text-nerv">
            {activePathVar ? `Select: ${activeTool?.envVars.find(v => v.name === activePathVar)?.label || activePathVar}` : 'Select Directory'}
          </h3>
        </div>
        {toolPathVars.length > 1 && (
          <div className="px-3 py-2 border-b border-sf flex gap-1.5 flex-wrap bg-void-panel">
            {toolPathVars.map(v => (
              <button key={v.name} onClick={() => setActivePathVar(v.name)} className={cn("px-2 py-1 text-[14px] font-bold uppercase transition-all", activePathVar === v.name ? "bg-nerv text-black" : "bg-void border border-sf text-steel-dim hover:text-nerv")}>{v.label.replace(' Directory', '')}</button>
            ))}
          </div>
        )}
        <FileBrowser currentPath={browsePath} onNavigate={handleBrowseNav} onSelect={handleBrowseSelect} items={browseItems} loading={browseLoading} favorites={favorites} onToggleFavorite={toggleFavorite} />
        <div className="p-3 border-t border-sf bg-void-panel space-y-2">
          <div className="text-[14px] font-sys font-bold text-steel-dim truncate">{selectedDir || 'No directory selected'}</div>
          <button onClick={handleScan} disabled={!selectedDir || scanning} className={cn("w-full flex items-center justify-center gap-2 py-2.5 font-bold text-xs transition-all active:scale-95 tracking-wider uppercase", !selectedDir || scanning ? "bg-steel-dim/30 text-steel-dim cursor-not-allowed" : "bg-nerv text-black hover:bg-nerv-hot")}>
            <Search className="w-3.5 h-3.5" /> {scanning ? 'Scanning...' : 'Scan Subtitle Tracks'}
          </button>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
        {/* Scan Results */}
        <div className="flex-1 border border-sf flex flex-col bg-void-panel overflow-hidden min-h-0">
          <div className="px-4 py-3 border-b border-sf flex items-center justify-between bg-void shrink-0">
            <div className="flex items-center gap-3">
              <h3 className="text-[12px] font-bold uppercase tracking-widest text-nerv">Scan Results</h3>
              {results && <span className="text-[14px] font-sys font-bold text-steel-dim">{results.totalFiles} files — baseline: {results.baseline} subtitle tracks</span>}
            </div>
            {results && results.extraCount > 0 && (
              <span className="flex items-center gap-1.5 text-[14px] font-bold uppercase px-2.5 py-1 bg-nerv/15 text-nerv">
                <AlertTriangle className="w-3 h-3" /> {results.extraCount} with extra tracks
              </span>
            )}
          </div>
          <div className="flex-1 overflow-auto">
            {!results && !scanning && <div className="flex items-center justify-center h-full text-steel-dim/50 text-xs font-bold uppercase tracking-widest">Select a directory and scan to analyze subtitle tracks</div>}
            {scanning && <div className="flex items-center justify-center h-full text-nerv text-xs font-bold uppercase tracking-widest animate-pulse">Scanning files...</div>}
            {results && results.files.map(file => (
              <div key={file.path} className={cn("border-b border-sf", file.hasExtra && "bg-nerv/[0.03]")}>
                <div onClick={() => handleExpand(file.path)} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-steel/[0.05] transition-all">
                  <FileVideo className={cn("w-4 h-4 shrink-0", file.hasExtra ? "text-nerv" : "text-steel-dim")} />
                  <span className="flex-1 text-xs font-bold text-steel truncate">{file.name}</span>
                  <span className={cn("text-[14px] font-bold font-sys tabular-nums", file.hasExtra ? "text-nerv" : "text-steel-dim")}>{file.subtitleTracks.length} track{file.subtitleTracks.length !== 1 ? 's' : ''}</span>
                  {file.hasExtra && <span className="text-[14px] font-bold uppercase px-2 py-0.5 bg-nerv/15 text-nerv">Extra</span>}
                  {file.hasFewer && <span className="text-[14px] font-bold uppercase px-2 py-0.5 bg-wire-cyan/15 text-wire-cyan">Fewer</span>}
                  <ChevronDown className={cn("w-3.5 h-3.5 text-steel-dim transition-transform", expandedFile === file.path && "rotate-180")} />
                </div>
                {expandedFile === file.path && (
                  <div className="px-4 pb-4 space-y-2">
                    <div className="border border-sf bg-void">
                      <div className="grid grid-cols-[32px_40px_1fr_1fr_100px_60px] gap-0 text-[14px] font-bold uppercase tracking-widest text-nerv px-3 py-2 border-b border-sf">
                        <span></span><span>#</span><span>Language</span><span>Track Name</span><span>Codec</span><span>Forced</span>
                      </div>
                      {file.subtitleTracks.map((track, i) => {
                        const isExtra = i >= results.baseline;
                        const isChecked = checkedTracks[file.path]?.[track.id] ?? true;
                        return (
                          <div key={track.index} className={cn("grid grid-cols-[32px_40px_1fr_1fr_100px_60px] gap-0 items-center px-3 py-2 border-b border-sf last:border-b-0", isExtra && "bg-nerv/[0.06]", !isChecked && "opacity-40")}>
                            <input type="checkbox" checked={isChecked} onChange={() => toggleTrackCheck(file.path, track.id)} className="w-4 h-4 accent-nerv" />
                            <span className={cn("text-[14px] font-bold font-sys", isExtra ? "text-nerv" : "text-steel-dim")}>{track.index}</span>
                            <span className="text-xs font-bold text-steel">{langLabel(track.language)} <span className="text-steel-dim">({track.language})</span></span>
                            <input type="text" value={editedNames[file.path]?.[track.index] ?? track.name} onChange={e => handleNameChange(file.path, track.index, e.target.value)} placeholder="(no name)" className={cn("border bg-void px-2 py-1.5 text-xs font-bold font-sys text-steel w-full", isExtra ? "border-nerv/30" : "border-sf")} />
                            <span className="text-[14px] font-sys text-steel-dim">{track.codec}</span>
                            <span className={cn("text-[14px] font-sys font-bold", track.forced ? "text-nerv" : "text-steel-dim")}>{track.forced ? 'Yes' : 'No'}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <button onClick={() => handleSave(file.path)} disabled={!hasChanges(file.path) || saving[file.path]} className={cn("flex items-center gap-2 px-3 py-2 text-[15px] font-bold uppercase transition-all", hasChanges(file.path) ? "bg-nerv text-black hover:bg-nerv-hot" : "bg-steel-dim/20 text-steel-dim cursor-not-allowed")}>
                        <Save className="w-3 h-3" /> {saving[file.path] ? 'Saving...' : 'Save Names'}
                      </button>
                      {hasChanges(file.path) && (
                        <button onClick={handleSaveAll} disabled={saving._all} className="flex items-center gap-2 px-3 py-2 text-[15px] font-bold uppercase border border-nerv/50 text-nerv hover:bg-nerv/10 transition-all">
                          {saving._all ? 'Applying...' : 'Apply Names to All Files'}
                        </button>
                      )}
                      {getUncheckedCount(file.path) > 0 && (<>
                        <button onClick={() => handleRemoveTracks(file.path)} disabled={removing[file.path]} className="flex items-center gap-2 px-3 py-2 text-[15px] font-bold uppercase bg-alert-red/90 text-white hover:bg-alert-red transition-all">
                          <Trash2 className="w-3 h-3" /> {removing[file.path] ? 'Removing...' : `Remove ${getUncheckedCount(file.path)} Unchecked`}
                        </button>
                        <button onClick={handleRemoveAll} disabled={removing._all} className="flex items-center gap-2 px-3 py-2 text-[15px] font-bold uppercase border border-alert-red/50 text-alert-red hover:bg-alert-red/10 transition-all">
                          {removing._all ? 'Applying...' : 'Apply to All Files'}
                        </button>
                      </>)}
                      {hasChanges(file.path) && !saving._all && <span className="text-[14px] text-nerv-dim font-bold">Unsaved changes</span>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Tool Strip + Inline Params */}
        <div className="shrink-0 border border-sf bg-void-panel overflow-hidden">
          <div className="px-4 py-2.5 border-b border-sf flex items-center gap-2 flex-wrap bg-void">
            <span className="text-[12px] font-bold uppercase tracking-widest text-nerv mr-2">Tools</span>
            {subTools.map(tool => (
              <button key={tool.id} onClick={() => selectTool(tool)} className={cn("px-3 py-1.5 text-[14px] font-bold uppercase tracking-wider transition-all", activeTool?.id === tool.id ? "bg-nerv text-black" : "bg-void-panel border border-sf text-steel-dim hover:text-nerv hover:border-nerv-dim/30")}>
                {tool.name}
              </button>
            ))}
          </div>
          {activeTool && (
            <div className="p-4 space-y-3 border-b border-sf">
              <p className="text-[14px] text-steel-dim">{activeTool.description}</p>
              {toolPathVars.map(v => (
                <div key={v.name} className="flex items-center gap-3">
                  <span className="text-[14px] font-bold uppercase tracking-widest text-nerv w-40 shrink-0">{v.label}</span>
                  <div className="flex-1 border border-sf bg-void px-2.5 py-1.5 text-xs font-bold font-sys text-steel-dim truncate cursor-pointer hover:border-nerv-dim/30" onClick={() => { setActivePathVar(v.name); if (toolEnv[v.name]) setBrowsePath(toolEnv[v.name]); }}>
                    {toolEnv[v.name] || '(click to select)'}
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                {toolNonPathVars.map(v => (
                  <div key={v.name} className="space-y-1">
                    <label className="text-[14px] font-bold uppercase tracking-widest text-nerv">{v.label}</label>
                    {activeTool.id === 'set_default_subtitle' && v.name === 'SUB_CHOICE' ? (
                      probingDefault ? (
                        <div className="px-3 py-2.5 text-xs font-bold border border-sf bg-void text-steel-dim">Scanning...</div>
                      ) : defaultSubTracks.length > 0 ? (
                        <select value={toolEnv.SUB_CHOICE || ''} onChange={e => setToolEnv(prev => ({ ...prev, SUB_CHOICE: e.target.value }))} className={inputCls}>
                          {defaultSubTracks.map(t => <option key={t.index} value={String(t.index)}>Track {t.index}: {t.lang} — {t.name || '(no name)'} ({t.codec}{t.forced ? ', forced' : ''})</option>)}
                        </select>
                      ) : (
                        <div className="px-3 py-2.5 text-xs font-bold border border-sf bg-void text-steel-dim">Select a directory first</div>
                      )
                    ) : v.type === 'boolean' ? (
                      <button onClick={() => setToolEnv(prev => ({ ...prev, [v.name]: prev[v.name] === '1' ? '0' : '1' }))} className={cn("px-3 py-2.5 text-xs font-bold border transition-all w-full text-left", toolEnv[v.name] === '1' ? "border-data-green/30 bg-data-green/10 text-data-green" : "border-sf bg-void text-steel-dim")}>
                        {toolEnv[v.name] === '1' ? 'Enabled' : 'Disabled'}
                      </button>
                    ) : (
                      <input type={v.type === 'number' ? 'number' : 'text'} value={toolEnv[v.name] || ''} onChange={e => setToolEnv(prev => ({ ...prev, [v.name]: e.target.value }))} placeholder={v.default || ''} className={inputCls} />
                    )}
                  </div>
                ))}
              </div>
              {/* Action bar */}
              <div className="flex items-center gap-3 pt-1">
                <button onClick={() => setToolEnv(prev => ({ ...prev, DRY_RUN: prev.DRY_RUN === '1' ? '0' : '1' }))} className={cn("flex items-center gap-2 px-3 py-2.5 text-[15px] font-bold uppercase border transition-all", toolEnv.DRY_RUN === '1' ? "border-nerv/30 bg-nerv/10 text-nerv" : "border-sf bg-void text-steel-dim")}>
                  {toolEnv.DRY_RUN === '1' ? 'Dry Run On' : 'Dry Run Off'}
                </button>
                <button onClick={handleRunTool} disabled={toolStatus?.running} className={cn("flex items-center gap-2 px-6 py-2.5 text-[15px] font-bold uppercase transition-all active:scale-[0.98]", toolStatus?.running ? "bg-steel-dim/30 text-steel-dim cursor-not-allowed" : "bg-nerv text-black hover:bg-nerv-hot")}>
                  <Play className="w-3.5 h-3.5" /> {toolStatus?.running ? 'Running...' : 'Run'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Tool Output */}
        {(toolLogs.length > 0 || toolStatus?.running) && (
          <div className="shrink-0 border border-sf overflow-hidden flex flex-col h-[250px] bg-void-panel">
            <div className="px-4 py-2 border-b border-sf flex items-center justify-between bg-void shrink-0">
              <div className="flex items-center gap-2"><Terminal className="w-3.5 h-3.5 text-nerv" /><span className="text-[12px] font-bold uppercase tracking-widest text-nerv">Tool Output</span></div>
              <div className="flex items-center gap-3">
                {toolStatus?.running && <button onClick={stopTool} className="flex items-center gap-1.5 text-[14px] font-bold uppercase text-alert-red hover:text-alert-red/80 transition-colors"><StopCircle className="w-3 h-3" /> Stop</button>}
                {!toolAutoScroll && <button onClick={() => setToolAutoScroll(true)} className="text-[14px] font-bold uppercase text-wire-cyan transition-colors">Resume Scroll</button>}
                <button onClick={() => setToolLogs([])} className="text-[14px] font-bold uppercase text-steel-dim hover:text-steel transition-colors">Clear</button>
              </div>
            </div>
            <div ref={toolLogRef} onScroll={() => { if (!toolLogRef.current) return; const { scrollTop, scrollHeight, clientHeight } = toolLogRef.current; setToolAutoScroll(scrollHeight - scrollTop - clientHeight < 60); }} className="flex-1 p-4 overflow-auto font-sys text-[17px] leading-relaxed whitespace-pre-wrap text-data-green-dim">
              {toolLogs.length === 0 && <p className="text-steel-dim/50 italic">Waiting for output...</p>}
              {toolLogs.map((log, i) => <div key={i} className={cn("mb-0.5", log.includes('[Process exited') ? (log.includes('code 0') ? 'text-data-green' : 'text-alert-red') : '')}>{log}</div>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const TOOL_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'muxing', label: 'Muxing' },
  { id: 'metadata', label: 'Metadata' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'filtering', label: 'Filtering' },
  { id: 'release', label: 'Release' },
];

const CATEGORY_COLORS = {
  audio: 'bg-wire-cyan/15 text-wire-cyan',
  subtitles: 'bg-nerv/15 text-nerv',
  muxing: 'bg-wire-cyan/15 text-wire-cyan',
  metadata: 'bg-nerv/15 text-nerv',
  analysis: 'bg-data-green/15 text-data-green',
  filtering: 'bg-wire-cyan/15 text-wire-cyan',
  release: 'bg-nerv/15 text-nerv',
  defaults: 'bg-steel-dim/15 text-steel-dim',
};

const ToolCard = ({ tool, onConfigure }) => {
  const catColor = CATEGORY_COLORS[tool.category] || 'bg-steel-dim/15 text-steel-dim';
  const modeBadge = {
    'in-place': { label: 'Edits In Place', color: 'bg-nerv/15 text-nerv' },
    'output': { label: 'Outputs to File', color: 'bg-data-green/15 text-data-green' },
    'read-only': { label: 'Read Only', color: 'bg-wire-cyan/15 text-wire-cyan' },
  }[tool.mode];
  return (
    <div onClick={onConfigure} className="border border-sf p-4 flex flex-col transition-all hover:border-nerv-dim/30 cursor-pointer active:scale-[0.98] bg-void-panel">
      <div className="flex items-start justify-between mb-2">
        <div className="w-8 h-8 bg-nerv/10 flex items-center justify-center"><Wrench className="w-4 h-4 text-nerv" /></div>
        <div className="flex flex-col items-end gap-1">
          <span className={cn("text-[14px] font-bold uppercase px-2 py-0.5", catColor)}>{tool.category}</span>
          {modeBadge && <span className={cn("text-[14px] font-bold uppercase px-2 py-0.5", modeBadge.color)}>{modeBadge.label}</span>}
        </div>
      </div>
      <h4 className="text-xs font-bold mb-1 text-steel">{tool.name}</h4>
      <p className="text-[15px] flex-1 text-steel-dim">{tool.description}</p>
    </div>
  );
};

const ToolRunModal = ({ tool, onClose, setToolLogs, appSettings, favorites, toggleFavorite }) => {
  const [envValues, setEnvValues] = useState(() => {
    const init = {};
    tool.envVars.forEach(v => {
      if (v.name === 'VIDEO_NAME' && appSettings?.releaseGroup) init[v.name] = `${appSettings.releaseGroup} AV1`;
      else if (v.name === 'PREFIX' && appSettings?.releaseGroup) init[v.name] = `[${appSettings.releaseGroup}]`;
      else init[v.name] = v.default || '';
    });
    return init;
  });
  const [browsePath, setBrowsePath] = useState('/');
  const [browseItems, setBrowseItems] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [activePathVar, setActivePathVar] = useState(() => {
    const firstBrowsable = tool.envVars.find(v => v.type === 'path' || v.type === 'file');
    return firstBrowsable ? firstBrowsable.name : null;
  });
  const [probeData, setProbeData] = useState(null);
  const [subTrackNames, setSubTrackNames] = useState([]);
  const [audioTracks, setAudioTracks] = useState([]);
  const [probingAudio, setProbingAudio] = useState(false);

  useEffect(() => { browse(browsePath); }, [browsePath]);

  useEffect(() => {
    if (tool.id !== 'set_default_audio') return;
    const dir = envValues[activePathVar] || browsePath;
    if (!dir || dir === '/') { setAudioTracks([]); return; }
    let cancelled = false;
    setProbingAudio(true);
    axios.get(`/api/tools/probe?path=${encodeURIComponent(dir)}`)
      .then(res => {
        if (cancelled) return;
        const tracks = (res.data.tracks || []).filter(t => t.type === 'audio').map((t, i) => {
          const lang = t.properties?.language || 'und';
          const name = t.properties?.track_name || '';
          const codec = t.codec || t.properties?.codec_id || 'unknown';
          const channels = t.properties?.audio_channels || '?';
          return { index: i + 1, lang, name, codec, channels };
        });
        setAudioTracks(tracks);
        if (tracks.length > 0 && !envValues.AUDIO_CHOICE) {
          setEnvValues(prev => ({ ...prev, AUDIO_CHOICE: String(tracks[0].index) }));
        }
      })
      .catch(() => { if (!cancelled) setAudioTracks([]); })
      .finally(() => { if (!cancelled) setProbingAudio(false); });
    return () => { cancelled = true; };
  }, [browsePath, envValues[activePathVar], tool.id, activePathVar]);

  const browse = async (p) => {
    setBrowseLoading(true);
    try { const res = await axios.get(`/api/browse?path=${encodeURIComponent(p)}`); setBrowseItems(res.data); } catch (e) { console.error(e); } finally { setBrowseLoading(false); }
  };

  const selectDir = (dirPath) => {
    const activeVar = tool.envVars.find(v => v.name === activePathVar);
    if (activePathVar && activeVar?.type === 'path') setEnvValues(prev => ({ ...prev, [activePathVar]: dirPath }));
  };

  const scanTracks = async () => {
    const dir = envValues[activePathVar] || browsePath;
    try {
      const res = await axios.get(`/api/tools/probe?path=${encodeURIComponent(dir)}`);
      setProbeData(res.data);
      const subTracks = (res.data.tracks || []).filter(t => t.type === 'subtitles');
      setSubTrackNames(subTracks.map(t => t.properties?.track_name || ''));
    } catch (e) { console.error(e); alert('Failed to probe directory: ' + (e.response?.data?.error || e.message)); }
  };

  const handleRun = async () => {
    const env = { ...envValues };
    if (tool.id === 'rename_subtitles' && subTrackNames.length > 0) {
      env.SUB_NAMES = subTrackNames.join('|');
    }
    Object.keys(env).forEach(k => { if (env[k] === '') delete env[k]; });
    setToolLogs([]);
    try {
      await axios.post(`/api/tools/${tool.id}/run`, { env });
      onClose();
    } catch (e) { alert(e.response?.data?.error || e.message); }
  };

  const inputCls = "w-full border border-sf bg-void p-2.5 text-xs font-bold text-steel font-sys";
  const pathVars = tool.envVars.filter(v => v.type === 'path');
  const fileVar = tool.envVars.find(v => v.type === 'file');
  const browserVars = [...(fileVar ? [fileVar] : []), ...pathVars];
  const nonPathVars = tool.envVars.filter(v => v.type !== 'path' && v.type !== 'file');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/90">
      <div className="border border-sf w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col bg-void-panel shadow-[0_0_60px_rgba(255,152,48,0.05)]">
        <div className="px-6 py-4 border-b border-sf flex justify-between items-center bg-void">
          <div>
            <h3 className="nerv-title text-nerv text-lg">{tool.name.toUpperCase()}</h3>
            <p className="text-[15px] mt-0.5 text-steel-dim">{tool.description}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-steel-dim hover:text-alert-red transition-all"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-auto flex">
          <div className="w-1/2 border-r border-sf flex flex-col bg-void">
            <FileBrowser
              currentPath={browsePath}
              onNavigate={setBrowsePath}
              onSelect={selectDir}
              onFileSelect={fileVar && activePathVar === fileVar.name ? (filePath) => setEnvValues(prev => ({ ...prev, [fileVar.name]: filePath })) : undefined}
              selectedFile={fileVar ? envValues[fileVar.name] : undefined}
              items={browseItems}
              loading={browseLoading}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              header={browserVars.length > 1 && (
                <div className="px-4 py-2 border-b border-sf flex gap-1.5 flex-wrap">
                  {browserVars.map(v => (
                    <button key={v.name} onClick={() => setActivePathVar(v.name)} className={cn("px-2.5 py-1 text-[14px] font-bold uppercase transition-all", activePathVar === v.name ? "bg-nerv text-black" : "bg-void-panel border border-sf text-steel-dim hover:text-nerv")}>{v.label}</button>
                  ))}
                </div>
              )}
            />
          </div>
          <div className="w-1/2 p-8 space-y-5 overflow-auto bg-void-panel">
            {browserVars.map(v => (
              <div key={v.name} className="space-y-1.5">
                <label className="text-[14px] font-bold uppercase tracking-widest text-nerv">{v.label}</label>
                <input type="text" value={envValues[v.name] || ''} onChange={e => setEnvValues({...envValues, [v.name]: e.target.value})} placeholder={v.default || (v.type === 'file' ? 'Select a file from browser...' : 'Select from browser...')} className={inputCls} />
              </div>
            ))}
            {nonPathVars.filter(v => v.name !== 'DRY_RUN').map(v => (
              <div key={v.name} className="space-y-1.5">
                <label className="text-[14px] font-bold uppercase tracking-widest text-nerv">{v.label}</label>
                {tool.id === 'set_default_audio' && v.name === 'AUDIO_CHOICE' ? (
                  probingAudio ? (
                    <div className="px-3 py-2.5 text-xs font-bold border border-sf bg-void text-steel-dim">Scanning audio tracks...</div>
                  ) : audioTracks.length > 0 ? (
                    <select value={envValues.AUDIO_CHOICE || ''} onChange={e => setEnvValues({...envValues, AUDIO_CHOICE: e.target.value})} className={inputCls}>
                      {audioTracks.map(t => (
                        <option key={t.index} value={String(t.index)}>
                          Track {t.index}: {t.lang} — {t.name || '(no name)'} ({t.codec}, {t.channels}ch)
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="px-3 py-2.5 text-xs font-bold border border-sf bg-void text-steel-dim">Select a directory to scan audio tracks</div>
                  )
                ) : v.type === 'boolean' ? (
                  <button onClick={() => setEnvValues({...envValues, [v.name]: envValues[v.name] === '1' ? '0' : '1'})} className={cn("px-3 py-2.5 text-xs font-bold border transition-all w-full text-left", envValues[v.name] === '1' ? "border-data-green/30 bg-data-green/10 text-data-green" : "border-sf bg-void text-steel-dim")}>
                    {envValues[v.name] === '1' ? 'Enabled' : 'Disabled'}
                  </button>
                ) : (
                  <input type={v.type === 'number' ? 'number' : 'text'} value={envValues[v.name] || ''} onChange={e => setEnvValues({...envValues, [v.name]: e.target.value})} placeholder={v.default || ''} className={inputCls} />
                )}
              </div>
            ))}
            {tool.id === 'rename_subtitles' && (
              <div className="space-y-3">
                <button onClick={scanTracks} className="flex items-center gap-2 px-3 py-2 text-[15px] font-bold uppercase border border-sf bg-void text-steel hover:text-nerv hover:border-nerv-dim/30 transition-all"><Search className="w-3 h-3" /> Scan Tracks</button>
                {subTrackNames.length > 0 && subTrackNames.map((name, i) => (
                  <div key={i} className="space-y-1">
                    <label className="text-[14px] font-bold uppercase tracking-widest text-nerv">Subtitle Track {i + 1}</label>
                    <input type="text" value={name} onChange={e => { const n = [...subTrackNames]; n[i] = e.target.value; setSubTrackNames(n); }} className={inputCls} />
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-3 pt-1">
              <button onClick={() => setEnvValues({...envValues, DRY_RUN: envValues.DRY_RUN === '1' ? '0' : '1'})} className={cn("flex items-center gap-2 px-3 py-2.5 text-[15px] font-bold uppercase border transition-all", envValues.DRY_RUN === '1' ? "border-nerv/30 bg-nerv/10 text-nerv" : "border-sf bg-void text-steel-dim")}>
                {envValues.DRY_RUN === '1' ? 'DRY RUN ON' : 'DRY RUN OFF'}
              </button>
            </div>
            <button onClick={handleRun} className="w-full py-4 font-bold text-sm transition-all active:scale-[0.98] uppercase tracking-wider text-black flex items-center justify-center gap-2 bg-nerv hover:bg-nerv-hot">
              <Play className="w-4 h-4" /> Run Tool
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ToolsSection = ({ toolLogs, setToolLogs, toolStatus, toolLogRef, appSettings, favorites, toggleFavorite }) => {
  const [tools, setTools] = useState([]);
  const [category, setCategory] = useState('all');
  const [selectedTool, setSelectedTool] = useState(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    axios.get('/api/tools').then(r => setTools(r.data)).catch(console.error);
  }, []);

  useEffect(() => {
    if (autoScroll && toolLogRef.current) toolLogRef.current.scrollTop = toolLogRef.current.scrollHeight;
  }, [toolLogs, autoScroll, toolLogRef]);

  const filtered = (category === 'all' ? tools : tools.filter(t => t.category === category)).filter(t => !AUDIO_TAB_TOOL_IDS.includes(t.id) && !SUBTITLE_TAB_TOOL_IDS.includes(t.id));
  const handleScroll = () => {
    if (!toolLogRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = toolLogRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 60);
  };
  const stopTool = async () => { try { await axios.post(`/api/tools/${toolStatus?.toolId}/stop`); } catch (e) { console.error(e); } };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {TOOL_CATEGORIES.map(cat => (
          <button key={cat.id} onClick={() => setCategory(cat.id)} className={cn("px-3 py-1.5 text-[15px] font-bold uppercase tracking-wider transition-all", category === cat.id ? "bg-nerv text-black" : "bg-void-panel border border-sf text-steel-dim hover:text-nerv hover:border-nerv-dim/30")}>{cat.label}</button>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {filtered.map(tool => (
          <ToolCard key={tool.id} tool={tool} onConfigure={() => setSelectedTool(tool)} />
        ))}
      </div>
      {(toolLogs.length > 0 || toolStatus?.running) && (
        <div className="panel overflow-hidden flex flex-col h-[400px]">
          <div className="panel-header">
            <div className="flex items-center gap-2"><Terminal className="w-3.5 h-3.5" /><span>Tool Output</span></div>
            <div className="flex items-center gap-3">
              {toolStatus?.running && <button onClick={stopTool} className="flex items-center gap-1.5 text-[14px] font-bold uppercase text-alert-red hover:text-alert-red/80 transition-colors"><StopCircle className="w-3 h-3" /> Stop</button>}
              {!autoScroll && <button onClick={() => setAutoScroll(true)} className="text-[14px] font-bold uppercase text-wire-cyan transition-colors">Resume Scroll</button>}
              <button onClick={() => setToolLogs([])} className="text-[14px] font-bold uppercase text-steel-dim hover:text-steel transition-colors">Clear</button>
            </div>
          </div>
          <div ref={toolLogRef} onScroll={handleScroll} className="flex-1 p-4 overflow-auto font-sys text-[17px] leading-relaxed whitespace-pre-wrap text-data-green-dim">
            {toolLogs.length === 0 && <p className="text-steel-dim/50 italic">Waiting for output...</p>}
            {toolLogs.map((log, i) => <div key={i} className={cn("mb-0.5", log.includes('[Process exited') ? (log.includes('code 0') ? 'text-data-green' : 'text-alert-red') : '')}>{log}</div>)}
          </div>
        </div>
      )}
      {selectedTool && <ToolRunModal tool={selectedTool} onClose={() => setSelectedTool(null)} setToolLogs={setToolLogs} appSettings={appSettings} favorites={favorites} toggleFavorite={toggleFavorite} />}
    </div>
  );
};

const ComparePage = ({ testEncodeStatus, setIsTestEncodeOpen, batchActive }) => {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [sessionData, setSessionData] = useState(null);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [activeVariant, setActiveVariant] = useState(0);
  const [viewMode, setViewMode] = useState('tab');
  const [loading, setLoading] = useState(true);

  const ZOOM_LEVELS = [1, 1.5, 2, 3, 4, 6, 8];
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showZoomIndicator, setShowZoomIndicator] = useState(false);
  const zoomTimerRef = useRef(null);

  const resetZoom = useCallback(() => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  const stepZoom = useCallback((direction) => {
    setZoomLevel(prev => {
      const idx = ZOOM_LEVELS.indexOf(prev);
      if (idx === -1) return prev;
      const next = direction > 0 ? Math.min(idx + 1, ZOOM_LEVELS.length - 1) : Math.max(idx - 1, 0);
      const newZoom = ZOOM_LEVELS[next];
      if (newZoom === 1) setPanOffset({ x: 0, y: 0 });
      return newZoom;
    });
    setShowZoomIndicator(true);
    clearTimeout(zoomTimerRef.current);
    zoomTimerRef.current = setTimeout(() => setShowZoomIndicator(false), 1200);
  }, []);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const cursorX = e.clientX - rect.left - rect.width / 2;
    const cursorY = e.clientY - rect.top - rect.height / 2;

    setZoomLevel(prev => {
      const idx = ZOOM_LEVELS.indexOf(prev);
      if (idx === -1) return prev;
      const next = e.deltaY < 0 ? Math.min(idx + 1, ZOOM_LEVELS.length - 1) : Math.max(idx - 1, 0);
      const newZoom = ZOOM_LEVELS[next];
      if (newZoom === 1) {
        setPanOffset({ x: 0, y: 0 });
      } else if (newZoom !== prev) {
        const ratio = newZoom / prev;
        setPanOffset(p => ({
          x: cursorX / newZoom - (cursorX / prev - p.x),
          y: cursorY / newZoom - (cursorY / prev - p.y),
        }));
      }
      return newZoom;
    });
    setShowZoomIndicator(true);
    clearTimeout(zoomTimerRef.current);
    zoomTimerRef.current = setTimeout(() => setShowZoomIndicator(false), 1200);
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (zoomLevel <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  }, [zoomLevel, panOffset]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    setPanOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const fetchSessions = async () => {
    try {
      const res = await axios.get('/api/test-encodes');
      setSessions(res.data);
      setLoading(false);
    } catch (err) { console.error(err); setLoading(false); }
  };

  useEffect(() => { fetchSessions(); }, []);

  useEffect(() => {
    if (testEncodeStatus?.phase === 'done') fetchSessions();
  }, [testEncodeStatus?.phase]);

  useEffect(() => {
    if (!selectedSession) { setSessionData(null); return; }
    (async () => {
      try {
        const res = await axios.get('/api/test-encodes/screenshots', { params: { session: selectedSession } });
        setSessionData(res.data);
        setCurrentPosition(0);
        setActiveVariant(0);
      } catch (err) { console.error(err); }
    })();
  }, [selectedSession]);

  useEffect(() => { resetZoom(); }, [currentPosition, selectedSession]);

  const imagesVisible = !!(selectedSession && sessionData && (sessionData.variants || []).length > 0);
  useEffect(() => {
    document.documentElement.toggleAttribute('data-compare-active', imagesVisible);
    return () => document.documentElement.removeAttribute('data-compare-active');
  }, [imagesVisible]);

  useEffect(() => {
    if (!sessionData) return;
    const variants = sessionData.variants || [];
    const maxPos = Math.max(0, ...(variants.map(v => v.screenshots.length) || [0])) - 1;

    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); setCurrentPosition(p => Math.max(0, p - 1)); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setCurrentPosition(p => Math.min(maxPos, p + 1)); }
      else if (e.key.toLowerCase() === 's') { e.preventDefault(); setViewMode(m => m === 'tab' ? 'side-by-side' : 'tab'); }
      else if (e.key.toLowerCase() === 'z') { e.preventDefault(); resetZoom(); }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); stepZoom(1); }
      else if (e.key === '-') { e.preventDefault(); stepZoom(-1); }
      else if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key) - 1;
        if (idx < variants.length) { e.preventDefault(); setActiveVariant(idx); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sessionData, resetZoom, stepZoom]);

  const allSessions = [];
  sessions.forEach(s => s.sessions.forEach(sess => allSessions.push({ label: `${s.basename} — ${sess.timestamp}`, path: sess.path, variants: sess.variants })));

  const variants = sessionData?.variants || [];
  const maxScreenshots = Math.max(0, ...variants.map(v => v.screenshots.length));

  const imageUrl = (variantLabel, fileName) =>
    `/api/test-encodes/image?session=${encodeURIComponent(selectedSession)}&variant=${encodeURIComponent(variantLabel)}&file=${encodeURIComponent(fileName)}`;

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => setIsTestEncodeOpen(true)} disabled={batchActive} className={cn("flex items-center gap-2 px-4 py-2.5 transition-all font-bold text-xs active:scale-95 border uppercase tracking-wider", batchActive ? "border-sf bg-void-panel text-steel-dim cursor-not-allowed" : "border-sf bg-void-panel text-steel hover:text-wire-cyan hover:border-wire-cyan-dim/30")}>
          <FlaskConical className="w-3.5 h-3.5" /> New Test Encode
        </button>
        <select
          value={selectedSession}
          onChange={e => setSelectedSession(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2.5 border border-sf text-xs font-bold bg-void-panel text-steel font-sys"
        >
          <option value="">Select a session...</option>
          {allSessions.map(s => (
            <option key={s.path} value={s.path}>{s.label} ({s.variants.length} variants)</option>
          ))}
        </select>
        {selectedSession && (
          <button onClick={async () => {
            if (!confirm('Delete this session?')) return;
            try { await axios.delete('/api/test-encodes/session', { params: { session: selectedSession } }); setSelectedSession(''); setSessionData(null); fetchSessions(); } catch (e) { alert(e.response?.data?.error || e.message); }
          }} title="Delete selected session" className="p-2.5 text-steel-dim hover:text-alert-red transition-all">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        {allSessions.length > 0 && (
          <button onClick={async () => {
            if (!confirm(`Delete all ${allSessions.length} test encode sessions?`)) return;
            try { await axios.delete('/api/test-encodes/all'); setSelectedSession(''); setSessionData(null); fetchSessions(); } catch (e) { alert(e.response?.data?.error || e.message); }
          }} title="Delete all sessions" className="p-2.5 text-steel-dim hover:text-alert-red transition-all">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
        <button onClick={fetchSessions} title="Refresh sessions" className="p-2.5 text-steel-dim hover:text-nerv transition-all">
          <RefreshCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Test Encode Progress */}
      {testEncodeStatus?.running && <TestEncodeProgress status={testEncodeStatus} />}

      {/* Empty state */}
      {!selectedSession && !testEncodeStatus?.running && (
        <div className="border-2 border-dashed border-sf py-16 flex flex-col items-center justify-center bg-void text-steel-dim">
          <Image className="w-12 h-12 mb-3 opacity-50" />
          <p className="font-bold uppercase tracking-widest text-xs">{loading ? 'Loading...' : allSessions.length === 0 ? 'No Test Encodes Yet' : 'Select a Session'}</p>
          {allSessions.length === 0 && !loading && <p className="text-[15px] mt-1.5 text-steel-dim/50">Run a test encode to compare variants</p>}
        </div>
      )}

      {/* Compare Viewer */}
      {selectedSession && sessionData && variants.length > 0 && (
        <div className="border border-sf overflow-hidden bg-void-panel">
          {/* Variant tabs */}
          <div className="px-4 py-2 border-b border-sf flex items-center justify-between gap-3 bg-void">
            <div className="flex items-center gap-1 flex-wrap flex-1">
              {variants.map((v, i) => (
                <button key={v.label} onClick={() => setActiveVariant(i)} className={cn("px-3 py-1.5 text-[15px] font-bold transition-all uppercase tracking-wider", activeVariant === i ? "bg-wire-cyan text-black" : "text-steel-dim hover:text-wire-cyan")}>
                  <span className={cn("inline-block w-4 h-4 text-center mr-1 text-[14px] leading-4 font-bold", activeVariant === i ? "bg-black/20" : "bg-void-raised")}>{i + 1}</span>
                  {v.label}
                </button>
              ))}
            </div>
            <button onClick={() => setViewMode(m => m === 'tab' ? 'side-by-side' : 'tab')} title={`Switch to ${viewMode === 'tab' ? 'side-by-side' : 'tab'} view (S)`} className={cn("flex items-center gap-1.5 px-2.5 py-1.5 text-[15px] font-bold transition-all uppercase tracking-wider", viewMode === 'side-by-side' ? "bg-wire-cyan text-black" : "text-steel-dim hover:text-wire-cyan")}>
              <Columns className="w-3 h-3" />
              {viewMode === 'tab' ? 'Side by Side' : 'Tab View'}
            </button>
          </div>

          {/* Image area */}
          <div className="p-3 min-h-[400px] flex items-center justify-center bg-void">
            {viewMode === 'tab' ? (
              <div className="w-full flex items-center justify-center">
                {variants[activeVariant]?.screenshots[currentPosition] ? (
                  <div
                    className="relative overflow-hidden w-full select-none"
                    style={{ height: '70vh' }}
                    onWheel={handleWheel}
                    onMouseDown={handleMouseDown}
                    onDoubleClick={resetZoom}
                  >
                    <img
                      src={imageUrl(variants[activeVariant].label, variants[activeVariant].screenshots[currentPosition])}
                      alt={`${variants[activeVariant].label} - ${currentPosition + 1}`}
                      className={cn("w-full h-full object-contain", zoomLevel <= 1 ? "cursor-zoom-in" : (isDragging ? "cursor-grabbing" : "cursor-grab"))}
                      style={{
                        transform: `scale(${zoomLevel}) translate(${panOffset.x}px, ${panOffset.y}px)`,
                        transformOrigin: 'center center',
                      }}
                      draggable={false}
                    />
                    {zoomLevel > 1 && showZoomIndicator && (
                      <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/70 text-data-green text-[15px] font-bold font-sys">
                        {zoomLevel}x
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-steel-dim/50 italic">No screenshot at this position</p>
                )}
              </div>
            ) : (
              <div className="w-full flex gap-2 overflow-x-auto">
                {variants.map((v, i) => (
                  <div key={v.label} className="flex-1 min-w-[200px] flex flex-col items-center gap-1.5">
                    <span className={cn("text-[15px] font-bold px-2.5 py-0.5 uppercase tracking-wider", activeVariant === i ? "bg-wire-cyan text-black" : "bg-void-raised text-steel-dim")}>{v.label}</span>
                    {v.screenshots[currentPosition] ? (
                      <div
                        className="relative overflow-hidden w-full select-none"
                        style={{ height: '50vh' }}
                        onWheel={handleWheel}
                        onMouseDown={handleMouseDown}
                        onDoubleClick={resetZoom}
                        onClick={() => { if (zoomLevel <= 1) setActiveVariant(i); }}
                      >
                        <img
                          src={imageUrl(v.label, v.screenshots[currentPosition])}
                          alt={`${v.label} - ${currentPosition + 1}`}
                          className={cn("w-full h-full object-contain", zoomLevel <= 1 ? "cursor-zoom-in" : (isDragging ? "cursor-grabbing" : "cursor-grab"))}
                          style={{
                            transform: `scale(${zoomLevel}) translate(${panOffset.x}px, ${panOffset.y}px)`,
                            transformOrigin: 'center center',
                          }}
                          draggable={false}
                        />
                        {i === 0 && zoomLevel > 1 && showZoomIndicator && (
                          <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/70 text-data-green text-[15px] font-bold font-sys">
                            {zoomLevel}x
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="w-full h-48 flex items-center justify-center bg-void">
                        <p className="text-[15px] text-steel-dim/50 italic">No screenshot</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Position navigation */}
          {maxScreenshots > 0 && (
            <div className="px-4 py-2 border-t border-sf flex items-center justify-center gap-3 bg-void">
              <button onClick={() => setCurrentPosition(p => Math.max(0, p - 1))} disabled={currentPosition === 0} className="p-1.5 transition-all disabled:opacity-30 text-steel-dim hover:text-nerv">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: maxScreenshots }, (_, i) => (
                  <button key={i} onClick={() => setCurrentPosition(i)} className={cn("w-2 h-2 transition-all", currentPosition === i ? "bg-wire-cyan scale-125" : "bg-void-raised hover:bg-steel-dim")} />
                ))}
              </div>
              <span className="text-[15px] font-bold tabular-nums min-w-[50px] text-center text-steel-dim font-sys">{currentPosition + 1} / {maxScreenshots}</span>
              <button onClick={() => setCurrentPosition(p => Math.min(maxScreenshots - 1, p + 1))} disabled={currentPosition >= maxScreenshots - 1} className="p-1.5 transition-all disabled:opacity-30 text-steel-dim hover:text-nerv">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Keyboard shortcuts */}
      {selectedSession && sessionData && (
        <div className="flex items-center justify-center gap-5 text-[14px] font-bold uppercase tracking-widest text-steel-dim/50">
          <span>← → Navigate</span>
          <span>1-9 Switch Variant</span>
          <span>S Toggle View</span>
          <span>+/− Zoom</span>
          <span>Z Reset Zoom</span>
        </div>
      )}
    </div>
  );
};

const TestEncodeProgress = ({ status }) => {
  const stopTestEncode = async () => { try { await axios.post('/api/test-encode/stop'); } catch (e) { console.error(e); } };
  const phaseLabels = { sample: 'Extracting Sample', encoding: 'Encoding', screenshots: 'Generating Screenshots' };
  const progress = status.progress || 0;
  return (
    <div className="border border-wire-cyan-dim/30 p-6 bg-void-panel space-y-4">
      <div className="flex justify-between items-start">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 mb-1">
            <FlaskConical className="w-4 h-4 text-wire-cyan" />
            <h3 className="text-base font-bold text-steel">Test Encode</h3>
          </div>
          <p className="text-[15px] font-bold mt-0.5 text-wire-cyan">
            {status.phaseLabel || phaseLabels[status.phase] || status.phase}
            {status.variantIndex > 0 && ` (${status.variantIndex} of ${status.totalVariants})`}
          </p>
        </div>
        <div className="flex items-center gap-3 ml-4">
          {status.phase === 'encoding' && <p className="text-3xl font-black tabular-nums text-wire-cyan glow-cyan">{progress.toFixed(1)}%</p>}
          <button onClick={stopTestEncode} title="Stop test encode" className="p-2.5 bg-alert-red/15 text-alert-red hover:bg-alert-red hover:text-black transition-all active:scale-95"><Square className="w-4 h-4" /></button>
        </div>
      </div>
      {status.phase === 'encoding' && (
        <div className="w-full h-2 bg-void border border-sf overflow-hidden">
          <div className="h-full bg-wire-cyan transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
        </div>
      )}
      {status.phase === 'encoding' && (status.fps || status.currentFrame) && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          <StatChip label="Frames" value={status.currentFrame && status.totalFrames ? `${status.currentFrame} / ${status.totalFrames}` : status.currentFrame} />
          <StatChip label="Speed" value={status.fps ? `${status.fps} fps` : null} />
          <StatChip label="Bitrate" value={status.bitrate ? `${status.bitrate} kb/s` : null} />
          <StatChip label="Size" value={status.size ? `${status.size} MB` : null} />
          <StatChip label="Elapsed" value={status.elapsed} />
          <StatChip label="Remaining" value={status.eta} />
        </div>
      )}
    </div>
  );
};

const TestEncodeHelp = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="p-1 text-steel-dim hover:text-nerv transition-all"><HelpCircle className="w-4 h-4" /></button>
      {open && (
        <div className="absolute top-full left-0 mt-1.5 p-3 border border-sf bg-void-panel shadow-2xl z-50 w-72 text-[15px] leading-relaxed text-steel-dim">
          Compare encoder settings side-by-side. Extracts a short sample from your source, encodes it once per variant with different flags, then generates screenshots for easy visual comparison.
        </div>
      )}
    </div>
  );
};

const TestEncodeModal = ({ onClose, encoders, favorites, toggleFavorite }) => {
  const [selectedFile, setSelectedFile] = useState('');
  const defaultEncoder = encoders[0]?.path || '';
  const [formData, setFormData] = useState({ duration: '60', startTime: '', screenshotCount: '6' });
  const makeVariant = (label) => ({ label, encoder: defaultEncoder, crf: '18', preset: '4', tune: '0', flags: '' });
  const [variants, setVariants] = useState([makeVariant('variant-a'), makeVariant('variant-b')]);
  const [browsePath, setBrowsePath] = useState('/');
  const [browseItems, setBrowseItems] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(false);

  useEffect(() => { browse(browsePath); }, [browsePath]);
  const browse = async (p) => { setBrowseLoading(true); try { const res = await axios.get(`/api/browse?path=${encodeURIComponent(p)}`); setBrowseItems(res.data); } catch (e) { console.error(e); } finally { setBrowseLoading(false); } };

  const addVariant = () => {
    const prev = variants[variants.length - 1];
    const label = `variant-${String.fromCharCode(97 + variants.length)}`;
    setVariants([...variants, { ...prev, label }]);
  };
  const removeVariant = (i) => { if (variants.length <= 1) return; setVariants(variants.filter((_, idx) => idx !== i)); };
  const updateVariant = (i, field, value) => { const v = [...variants]; v[i] = { ...v[i], [field]: value }; setVariants(v); };
  const duplicateVariant = (i) => {
    const src = variants[i];
    const label = `${src.label}-copy`;
    setVariants([...variants.slice(0, i + 1), { ...src, label }, ...variants.slice(i + 1)]);
  };

  const handleSubmit = async () => {
    if (!selectedFile) return alert('Select a source video file first!');
    const labels = variants.map(v => v.label.trim());
    if (labels.some(l => !l)) return alert('All variants need a label');
    if (new Set(labels).size !== labels.length) return alert('Variant labels must be unique');
    try {
      await axios.post('/api/test-encode', {
        sourceFile: selectedFile,
        duration: formData.duration,
        startTime: formData.startTime || undefined,
        screenshotCount: formData.screenshotCount,
        variants: variants.map(v => ({ label: v.label.trim(), encoder: v.encoder, crf: v.crf, preset: v.preset, tune: v.tune, flags: v.flags })),
      });
      onClose();
    } catch (e) { alert(e.response?.data?.error || e.message); }
  };

  const inputCls = "w-full border border-sf bg-void p-3 text-xs font-bold text-steel font-sys";
  const compactInput = "w-full border border-sf bg-void-panel p-2 text-xs font-bold text-steel font-sys";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/90">
      <div className="border border-sf w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col bg-void-panel shadow-[0_0_60px_rgba(32,240,255,0.05)]">
        <div className="px-6 py-4 border-b border-sf flex justify-between items-center bg-void">
          <div className="flex items-center gap-3">
            <FlaskConical className="w-5 h-5 text-wire-cyan" />
            <h3 className="nerv-title text-wire-cyan text-lg">Test Encode</h3>
            <TestEncodeHelp />
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-steel-dim hover:text-alert-red transition-all"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-auto flex">
          <div className="w-1/2 border-r border-sf flex flex-col bg-void">
            <FileBrowser
              currentPath={browsePath}
              onNavigate={setBrowsePath}
              onFileSelect={(filePath) => setSelectedFile(filePath)}
              selectedFile={selectedFile}
              items={browseItems}
              loading={browseLoading}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
            />
          </div>
          <div className="w-1/2 p-8 space-y-5 overflow-auto bg-void-panel">
            <div className="space-y-1.5">
              <label className="text-[14px] font-bold uppercase tracking-widest text-wire-cyan">Selected File</label>
              <input type="text" value={selectedFile} readOnly placeholder="Select a video file from browser..." className={cn(inputCls, "opacity-70")} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5"><label className="text-[14px] font-bold uppercase tracking-widest text-wire-cyan">Duration (s)</label><input type="number" value={formData.duration} onChange={e => setFormData({...formData, duration: e.target.value})} className={inputCls} /></div>
              <div className="space-y-1.5"><label className="text-[14px] font-bold uppercase tracking-widest text-wire-cyan">Start Time</label><input type="text" value={formData.startTime} onChange={e => setFormData({...formData, startTime: e.target.value})} placeholder="Auto" className={inputCls} /></div>
              <div className="space-y-1.5"><label className="text-[14px] font-bold uppercase tracking-widest text-wire-cyan">Screenshots</label><input type="number" value={formData.screenshotCount} onChange={e => setFormData({...formData, screenshotCount: e.target.value})} className={inputCls} /></div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[14px] font-bold uppercase tracking-widest text-wire-cyan">Variants</label>
                <button onClick={addVariant} className="flex items-center gap-1.5 px-2.5 py-1 text-[14px] font-bold uppercase bg-void border border-sf text-steel hover:text-wire-cyan hover:border-wire-cyan-dim/30 transition-all"><Plus className="w-2.5 h-2.5" /> Add</button>
              </div>
              {variants.map((v, i) => (
                <div key={i} className="border border-sf bg-void">
                  <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                    <input type="text" value={v.label} onChange={e => updateVariant(i, 'label', e.target.value)} placeholder="Label" className="flex-1 border border-sf bg-void-panel p-2 text-xs font-bold text-steel font-sys" />
                    <button onClick={() => duplicateVariant(i)} title="Duplicate variant" className="p-1.5 text-steel-dim hover:text-wire-cyan transition-all"><Plus className="w-3.5 h-3.5" /></button>
                    {variants.length > 1 && <button onClick={() => removeVariant(i)} title="Remove variant" className="p-1.5 text-steel-dim hover:text-alert-red transition-all"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                  <div className="grid grid-cols-4 gap-2 px-3 pb-2">
                    <div>
                      <span className="text-[10px] font-bold text-steel-dim uppercase block mb-1">Encoder</span>
                      <select value={v.encoder} onChange={e => updateVariant(i, 'encoder', e.target.value)} className={compactInput}>{encoders.map(e => <option key={e.path} value={e.path}>{e.name}</option>)}</select>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-steel-dim uppercase block mb-1">CRF</span>
                      <input type="number" value={v.crf} onChange={e => updateVariant(i, 'crf', e.target.value)} className={compactInput} />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-steel-dim uppercase block mb-1">Preset</span>
                      <input type="number" value={v.preset} onChange={e => updateVariant(i, 'preset', e.target.value)} className={compactInput} />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-steel-dim uppercase block mb-1">Tune</span>
                      <input type="number" value={v.tune} onChange={e => updateVariant(i, 'tune', e.target.value)} className={compactInput} />
                    </div>
                  </div>
                  <div className="px-3 pb-3">
                    <span className="text-[10px] font-bold text-steel-dim uppercase block mb-1">Custom Flags</span>
                    <input type="text" value={v.flags} onChange={e => updateVariant(i, 'flags', e.target.value)} placeholder="e.g. --film-grain 4" className={compactInput} />
                  </div>
                </div>
              ))}
            </div>

            <button onClick={handleSubmit} disabled={!selectedFile} className="w-full py-4 font-bold text-sm transition-all active:scale-[0.98] uppercase tracking-wider text-black disabled:opacity-30 flex items-center justify-center gap-2 bg-wire-cyan hover:bg-wire-cyan/80">
              <FlaskConical className="w-4 h-4" /> Start Test Encode
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Main App Component ---

const App = () => {
  const [status, setStatus] = useState(null);
  const [systemMetrics, setSystemMetrics] = useState(null);
  const [logs, setLogs] = useState([]);
  const [buildLogs, setBuildLogs] = useState({});
  const [queue, setQueue] = useState([]);
  const [encoders, setEncoders] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const logRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [toolLogs, setToolLogs] = useState([]);
  const [toolStatus, setToolStatus] = useState(null);
  const [appSettings, setAppSettings] = useState({});
  const toolLogRef = useRef(null);
  const [isTestEncodeOpen, setIsTestEncodeOpen] = useState(false);
  const [testEncodeStatus, setTestEncodeStatus] = useState(null);
  const [versionInfo, setVersionInfo] = useState({ version: null, channel: 'release' });
  const [crtEnabled, setCrtEnabled] = useState(() => localStorage.getItem('crt-effects') !== 'off');
  const [lightMode, setLightMode] = useState(() => localStorage.getItem('theme') === 'light');

  useEffect(() => {
    localStorage.setItem('crt-effects', crtEnabled ? 'on' : 'off');
    document.documentElement.toggleAttribute('data-crt-off', !crtEnabled);
  }, [crtEnabled]);

  useEffect(() => {
    localStorage.setItem('theme', lightMode ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', lightMode ? 'light' : 'dark');
  }, [lightMode]);

  const fetchEncoders = useCallback(async () => { try { const res = await axios.get('/api/encoders'); setEncoders(res.data); } catch (err) { console.error(err); } }, []);
  const fetchQueue = useCallback(async () => { try { const res = await axios.get('/api/queue'); setQueue(res.data); } catch (err) { console.error(err); } }, []);
  const fetchSettings = useCallback(async () => { try { const res = await axios.get('/api/settings'); setAppSettings(res.data); } catch (err) { console.error(err); } }, []);

  useEffect(() => {
    socket.on('status', (data) => setStatus(prev => {
      const sameFile = prev?.currentFile === data.currentFile && data.status === 'encoding';
      return { ...data, crop: data.crop || (sameFile ? prev?.crop : undefined) };
    }));
    socket.on('logs', (data) => setLogs(prev => {
      const entry = typeof data === 'string' ? { type: 'info', text: data } : data;
      // Encode telemetry: replace last encode entry in-place
      if (entry.type === 'encode' && prev.length > 0) {
        const last = prev[prev.length - 1];
        if (last && (typeof last !== 'string') && last.type === 'encode') {
          return [...prev.slice(0, -1), entry];
        }
      }
      // Init append: merge with the last init/init_append entry
      if (entry.type === 'init_append' && prev.length > 0) {
        const last = prev[prev.length - 1];
        if (last && (typeof last !== 'string') && (last.type === 'init' || last.type === 'init_append')) {
          return [...prev.slice(0, -1), { type: 'init', text: last.text + '\n' + entry.text }];
        }
      }
      return [...prev.slice(-499), entry];
    }));
    socket.on('build_logs', (data) => setBuildLogs(prev => ({ ...prev, [data.encoder]: [...(prev[data.encoder] || []).slice(-499), data.log] })));
    socket.on('queue_update', (data) => setQueue(data));
    socket.on('build_complete', () => fetchEncoders());
    socket.on('tool_output', (data) => setToolLogs(prev => [...prev.slice(-499), data]));
    socket.on('tool_status', (data) => setToolStatus(data));
    socket.on('test_encode_status', (data) => { setTestEncodeStatus(data); if (data.phase === 'done') setActiveTab('compare'); });
    
    fetchEncoders(); fetchQueue(); fetchSettings();
    axios.get('/api/version').then(res => setVersionInfo(res.data)).catch(() => {});

    const metricsInterval = setInterval(() => {
      axios.get('/api/system/metrics').then(res => setSystemMetrics(res.data)).catch(() => {});
    }, 3000);

    return () => { 
      socket.off('status'); socket.off('logs'); socket.off('build_logs'); socket.off('queue_update'); 
      socket.off('build_complete'); socket.off('tool_output'); socket.off('tool_status'); socket.off('test_encode_status'); 
      clearInterval(metricsInterval);
    };
  }, [fetchEncoders, fetchQueue, fetchSettings]);

  useEffect(() => { if (autoScroll && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [logs, autoScroll]);

  const buildEncoder = async (name, branch) => { try { await axios.post(`/api/encoders/${name}/build`, { branch }); } catch (err) { alert(err.message); } };
  const saveAppSettings = async (newSettings) => { try { const res = await axios.post('/api/settings', newSettings); setAppSettings(res.data); } catch (err) { console.error(err); } };
  const toggleFavorite = async (dirPath) => {
    try { const res = await axios.post('/api/favorites/toggle', { path: dirPath }); setAppSettings(prev => ({ ...prev, favorites: res.data.favorites })); } catch (err) { console.error(err); }
  };

  const statusActive = status?.active;
  const toolRunning = toolStatus?.running;
  const testRunning = testEncodeStatus?.running;

  return (
    <div className="flex h-screen font-sys bg-void text-steel">
      {/* Sidebar */}
      <aside className="w-56 border-r border-sf bg-void flex flex-col shrink-0">
        <div className="px-4 h-12 shrink-0 border-b border-b-orange flex items-center gap-3">
          <svg viewBox="0 0 32 32" className="w-7 h-7 shrink-0" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Inverted pyramid — edge-on view */}
            {/* Front edge vertex at top center, base corners spread, apex at bottom */}
            {/* Base: 4 corners — front(top-center), left, right, back */}
            {/* Front top vertex */}
            {/* Left front edge */}
            <line x1="16" y1="3" x2="3" y2="10" stroke="var(--nerv-orange)" strokeWidth="1.3" />
            {/* Right front edge */}
            <line x1="16" y1="3" x2="29" y2="10" stroke="var(--nerv-orange)" strokeWidth="1.3" />
            {/* Left back edge (hidden) */}
            <line x1="16" y1="3" x2="8" y2="14" stroke="var(--nerv-orange)" strokeWidth="0.8" opacity="0.35" />
            {/* Right back edge (hidden) */}
            <line x1="16" y1="3" x2="24" y2="14" stroke="var(--nerv-orange)" strokeWidth="0.8" opacity="0.35" />
            {/* Base bottom edges */}
            <line x1="3" y1="10" x2="8" y2="14" stroke="var(--nerv-orange)" strokeWidth="1" opacity="0.5" />
            <line x1="29" y1="10" x2="24" y2="14" stroke="var(--nerv-orange)" strokeWidth="1" opacity="0.5" />
            {/* Back base edge (hidden) */}
            <line x1="8" y1="14" x2="24" y2="14" stroke="var(--nerv-orange)" strokeWidth="0.7" opacity="0.3" />
            {/* Front base edge */}
            <line x1="3" y1="10" x2="29" y2="10" stroke="var(--nerv-orange)" strokeWidth="1.3" />
            {/* Edges to apex (bottom point) */}
            <line x1="3" y1="10" x2="16" y2="30" stroke="var(--nerv-orange)" strokeWidth="1.3" />
            <line x1="29" y1="10" x2="16" y2="30" stroke="var(--nerv-orange)" strokeWidth="1.3" />
            <line x1="8" y1="14" x2="16" y2="30" stroke="var(--nerv-orange)" strokeWidth="0.8" opacity="0.35" />
            <line x1="24" y1="14" x2="16" y2="30" stroke="var(--nerv-orange)" strokeWidth="0.8" opacity="0.35" />
          </svg>
          <div className="flex flex-col min-w-0">
            <h1 className="font-title font-black text-nerv text-2xl tracking-[0.25em] leading-none">PRISM</h1>
            <span className="text-[10px] font-bold font-sys text-nerv-dim tracking-widest uppercase leading-tight mt-0.5">
              {versionInfo.channel === 'nightly' ? 'DEV BUILD' : (versionInfo.version ? `V${versionInfo.version}` : 'SYSTEM')}
            </span>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          <NavItem icon={<Activity className="w-3.5 h-3.5" />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavItem icon={<List className="w-3.5 h-3.5" />} label="Queue" active={activeTab === 'queue'} onClick={() => setActiveTab('queue')} />
          <NavItem icon={<Cpu className="w-3.5 h-3.5" />} label="Encoders" active={activeTab === 'encoders'} onClick={() => setActiveTab('encoders')} />
          <NavItem icon={<Wrench className="w-3.5 h-3.5" />} label="Tools" active={activeTab === 'tools'} onClick={() => setActiveTab('tools')} />
          <NavItem icon={<Music className="w-3.5 h-3.5" />} label="Audio" active={activeTab === 'audio'} onClick={() => setActiveTab('audio')} />
          <NavItem icon={<Languages className="w-3.5 h-3.5" />} label="Subtitles" active={activeTab === 'subtitles'} onClick={() => setActiveTab('subtitles')} />
          <NavItem icon={<FlaskConical className="w-3.5 h-3.5" />} label="Compare" active={activeTab === 'compare'} onClick={() => setActiveTab('compare')} />
          <NavItem icon={<Settings className="w-3.5 h-3.5" />} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </nav>
        <div className="p-3 space-y-2 border-t border-sf">
          <button onClick={() => setIsModalOpen(true)} disabled={testRunning} className={cn("w-full flex items-center justify-center gap-2 py-2.5 font-bold text-xs transition-all active:scale-95 tracking-wider uppercase", testRunning ? "bg-steel-dim/30 text-steel-dim cursor-not-allowed" : "bg-nerv text-black hover:bg-nerv-hot")}>
            <Plus className="w-3.5 h-3.5" />Add Encode
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden bg-void">
        <header className="h-12 shrink-0 border-b border-b-orange flex items-center justify-between px-6 bg-void z-10">
          <div className="flex items-center gap-4">
            <h2 className="nerv-title text-nerv text-[17px] uppercase tracking-[0.2em]">{activeTab}</h2>
            <span className="text-[10px] font-bold text-steel-dim uppercase tracking-[0.15em] font-sys hidden lg:inline">Processing, Rendering, and Interface System for Media</span>
          </div>
          <div className="flex items-center gap-3">
            {testRunning && <div className="flex items-center gap-2 text-[15px] text-black px-3 py-1 font-bold bg-wire-cyan animate-pulse tracking-wider"><FlaskConical className="w-3 h-3" /> TEST ENCODE</div>}
            {toolRunning && <div className="flex items-center gap-2 text-[15px] text-black px-3 py-1 font-bold bg-nerv animate-pulse tracking-wider"><Wrench className="w-3 h-3" /> {toolStatus.toolName?.toUpperCase()}</div>}
            {statusActive && !status?.testEncode && <div className="flex items-center gap-2 text-[15px] text-black px-3 py-1 font-bold bg-data-green animate-pulse tracking-wider">{status.status?.toUpperCase()}</div>}
          </div>
        </header>
        {activeTab === 'dashboard' && <Dashboard status={status} queue={queue} logs={logs} logRef={logRef} setLogs={setLogs} autoScroll={autoScroll} setAutoScroll={setAutoScroll} systemMetrics={systemMetrics} />}
        {activeTab === 'encoders' && <EncodersSection encoders={encoders} buildEncoder={buildEncoder} buildLogs={buildLogs} />}
        {activeTab !== 'dashboard' && activeTab !== 'encoders' && (
          <div className="flex-1 overflow-auto p-6 max-w-[1800px] mx-auto w-full">
            {activeTab === 'queue' && <QueueSection queue={queue} />}
            {activeTab === 'tools' && <ToolsSection toolLogs={toolLogs} setToolLogs={setToolLogs} toolStatus={toolStatus} toolLogRef={toolLogRef} appSettings={appSettings} favorites={appSettings.favorites} toggleFavorite={toggleFavorite} />}
            {activeTab === 'audio' && <AudioScanner favorites={appSettings.favorites} toggleFavorite={toggleFavorite} toolLogs={toolLogs} setToolLogs={setToolLogs} toolStatus={toolStatus} toolLogRef={toolLogRef} appSettings={appSettings} />}
            {activeTab === 'subtitles' && <SubtitleScanner favorites={appSettings.favorites} toggleFavorite={toggleFavorite} toolLogs={toolLogs} setToolLogs={setToolLogs} toolStatus={toolStatus} toolLogRef={toolLogRef} appSettings={appSettings} />}
            {activeTab === 'compare' && <ComparePage testEncodeStatus={testEncodeStatus} setIsTestEncodeOpen={setIsTestEncodeOpen} batchActive={statusActive && !status?.testEncode} />}
            {activeTab === 'settings' && <SettingsPage appSettings={appSettings} saveAppSettings={saveAppSettings} crtEnabled={crtEnabled} setCrtEnabled={setCrtEnabled} lightMode={lightMode} setLightMode={setLightMode} systemMetrics={systemMetrics} />}
          </div>
        )}
      </main>
      {isModalOpen && <AddBatchModal onClose={() => setIsModalOpen(false)} encoders={encoders} onSuccess={() => { setIsModalOpen(false); fetchQueue(); }} favorites={appSettings.favorites} toggleFavorite={toggleFavorite} />}
      {isTestEncodeOpen && <TestEncodeModal onClose={() => setIsTestEncodeOpen(false)} encoders={encoders} favorites={appSettings.favorites} toggleFavorite={toggleFavorite} />}
    </div>
  );
};

export default App;
