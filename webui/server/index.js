const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');
const os = require('os');

console.log("──────────────────────────────────────────────");
console.log("  PRISM // SYSTEM CONTROL v0.1.0");
console.log("  STATUS:      INITIALIZING");
console.log("  ENVIRONMENT: NODE / " + process.platform.toUpperCase());
console.log("──────────────────────────────────────────────");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const PORT = process.env.PORT || 3000;
const CONFIG_DIR = process.env.CONFIG_DIR || (fs.existsSync('/config') ? '/config' : path.join(__dirname, '../../config'));
const QUEUE_FILE = path.join(CONFIG_DIR, 'queue.json');
const ENCODERS_DIR = path.join(CONFIG_DIR, 'encoders');
const SCRIPTS_DIR = path.join(__dirname, '../../scripts');
const ROOT_DIR = path.join(__dirname, '../../');
const TOOLS_DIR = path.join(__dirname, '../../tools');
const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json');
const TOOL_REGISTRY_FILE = path.join(__dirname, '../shared/toolRegistry.json');
const HISTORY_FILE = path.join(CONFIG_DIR, 'history.json');
const HISTORY_DIR = path.join(CONFIG_DIR, 'history');

let queue = [];
let currentJob = null;
let isBuilding = false;
let paused = false;
let currentToolChild = null;
let toolRunning = false;
let currentToolBuffer = [];
let currentToolMeta = null;
let testEncodeRunning = false;
let currentTestEncodeChild = null;

const tasksetAvailable = (() => {
  try { require('child_process').execSync('which taskset', { stdio: 'ignore' }); return true; }
  catch { return false; }
})();

function computeThreadAllocations(totalThreads, instanceCount, reservedCores, threadsPerCCD) {
  const halfThreads = totalThreads / 2;

  if (threadsPerCCD > 0) {
    // CCD-aware allocation (AMD Zen: core N → threads N and N + halfThreads)
    const coresPerCCD = threadsPerCCD / 2;
    const numCCDs = Math.ceil(halfThreads / coresPerCCD);

    // Build list of all cores with their thread pairs
    const allCores = [];
    for (let c = 0; c < halfThreads; c++) {
      allCores.push({ core: c, threads: [c, c + halfThreads], ccd: Math.floor(c / coresPerCCD) });
    }

    // Reserve cores from the start
    const availableCores = allCores.slice(reservedCores);

    // Group available cores by CCD
    const ccdGroups = {};
    for (const core of availableCores) {
      if (!ccdGroups[core.ccd]) ccdGroups[core.ccd] = [];
      ccdGroups[core.ccd].push(core);
    }
    const ccdKeys = Object.keys(ccdGroups).map(Number).sort((a, b) => a - b);

    // Assign instances to CCDs
    const allocations = [];
    if (instanceCount === 1) {
      // Single instance — use all available cores across all CCDs
      const threads = availableCores.flatMap(c => c.threads).sort((a, b) => a - b);
      allocations.push({ cpuList: formatCpuList(threads), threadCount: threads.length });
    } else if (instanceCount <= ccdKeys.length) {
      // One instance per CCD — distribute cores evenly across selected CCDs
      const selectedCCDs = ccdKeys.slice(0, instanceCount);
      for (const ccdIdx of selectedCCDs) {
        const cores = ccdGroups[ccdIdx];
        const threads = cores.flatMap(c => c.threads).sort((a, b) => a - b);
        allocations.push({ cpuList: formatCpuList(threads), threadCount: threads.length });
      }
    } else {
      // More instances than CCDs — split cores within CCDs
      // Distribute instances across CCDs proportionally to available cores
      const totalAvailCores = availableCores.length;
      let instanceIdx = 0;
      for (const ccdIdx of ccdKeys) {
        const cores = ccdGroups[ccdIdx];
        const instancesForCCD = Math.max(1, Math.round((cores.length / totalAvailCores) * instanceCount));
        const actualInstances = Math.min(instancesForCCD, instanceCount - instanceIdx);
        const base = Math.floor(cores.length / actualInstances);
        const remainder = cores.length % actualInstances;
        let offset = 0;
        for (let i = 0; i < actualInstances && instanceIdx < instanceCount; i++) {
          const count = base + (i < remainder ? 1 : 0);
          const sliceCores = cores.slice(offset, offset + count);
          const threads = sliceCores.flatMap(c => c.threads).sort((a, b) => a - b);
          if (threads.length > 0) allocations.push({ cpuList: formatCpuList(threads), threadCount: threads.length });
          offset += count;
          instanceIdx++;
        }
      }
    }
    return allocations;
  }

  // Simple contiguous split (no CCD awareness)
  // Reserve cores from the start (both thread and hyperthread)
  const reservedThreads = [];
  for (let c = 0; c < reservedCores && c < halfThreads; c++) {
    reservedThreads.push(c, c + halfThreads);
  }
  const available = [];
  for (let t = 0; t < totalThreads; t++) {
    if (!reservedThreads.includes(t)) available.push(t);
  }
  const base = Math.floor(available.length / instanceCount);
  const remainder = available.length % instanceCount;
  const allocations = [];
  let offset = 0;
  for (let i = 0; i < instanceCount; i++) {
    const count = base + (i < remainder ? 1 : 0);
    const threads = available.slice(offset, offset + count);
    if (threads.length > 0) allocations.push({ cpuList: formatCpuList(threads), threadCount: threads.length });
    offset += count;
  }
  return allocations;
}

function formatCpuList(threads) {
  if (threads.length === 0) return '';
  threads.sort((a, b) => a - b);
  const ranges = [];
  let start = threads[0], end = threads[0];
  for (let i = 1; i < threads.length; i++) {
    if (threads[i] === end + 1) { end = threads[i]; }
    else { ranges.push(start === end ? `${start}` : `${start}-${end}`); start = end = threads[i]; }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  return ranges.join(',');
}

function getCurrentStatus() {
  const s = isBuilding ? 'building' : (worker.processing ? 'encoding' : (paused ? 'paused' : 'idle'));
  return { active: isBuilding || worker.processing, status: s, activeJob: isBuilding ? { name: 'Building' } : (currentJob ? { name: currentJob.input_folder } : null), queueLength: queue.length };
}

io.on('connection', (socket) => {
  socket.emit('status', getCurrentStatus());
  socket.emit('queue_update', queue);
  if (currentToolMeta) {
    socket.emit('tool_status', { running: toolRunning, toolId: currentToolMeta.toolId, toolName: currentToolMeta.toolName });
  }
});

async function loadSettings() {
  try {
    if (await fs.pathExists(SETTINGS_FILE)) return await fs.readJson(SETTINGS_FILE);
  } catch (err) { console.error('Settings load error:', err); }
  return {};
}

async function saveSettings(settings) {
  try { await fs.ensureDir(CONFIG_DIR); await fs.writeJson(SETTINGS_FILE, settings); } catch (err) { console.error('Settings save error:', err); }
}

// --- History Persistence ---
const MAX_HISTORY_ENTRIES = 200;
const MAX_TOOL_OUTPUT_LINES = 5000;

async function loadHistory() {
  try {
    if (await fs.pathExists(HISTORY_FILE)) return await fs.readJson(HISTORY_FILE);
  } catch (err) { console.error('History load error:', err); }
  return { entries: [] };
}

async function saveHistory(history) {
  if (history.entries.length > MAX_HISTORY_ENTRIES) {
    const pruned = history.entries.splice(0, history.entries.length - MAX_HISTORY_ENTRIES);
    for (const entry of pruned) {
      if (entry.type === 'tool') {
        await fs.remove(path.join(HISTORY_DIR, `${entry.id}.log`)).catch(() => {});
      }
    }
  }
  try { await fs.ensureDir(CONFIG_DIR); await fs.writeJson(HISTORY_FILE, history); }
  catch (err) { console.error('History save error:', err); }
}

async function addHistoryEntry(entry) {
  const history = await loadHistory();
  history.entries.push(entry);
  await saveHistory(history);
}

// --- Webhook Notifications ---
function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function formatSize(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

function isDiscordWebhook(url) {
  return /discord(?:app)?\.com\/api\/webhooks\//.test(url);
}

function buildDiscordPayload(event, data) {
  if (event === 'batch_complete') {
    return {
      embeds: [{
        title: 'Encode Complete',
        color: 0x00c853,
        fields: [
          { name: 'Folder', value: data.folder, inline: false },
          { name: 'Files', value: `${data.files}`, inline: true },
          { name: 'Encoder', value: data.encoder, inline: true },
          { name: 'Duration', value: data.duration, inline: true },
          { name: 'Total Size', value: data.totalSize, inline: true },
        ],
        timestamp: data.timestamp,
        footer: { text: 'PRISM' },
      }],
    };
  }
  if (event === 'encode_error') {
    return {
      embeds: [{
        title: 'Encode Error',
        color: 0xff1744,
        fields: [
          { name: 'Folder', value: data.folder, inline: false },
          { name: 'File', value: data.file, inline: true },
          { name: 'Exit Code', value: `${data.exitCode}`, inline: true },
        ],
        timestamp: data.timestamp,
        footer: { text: 'PRISM' },
      }],
    };
  }
  if (event === 'tool_complete') {
    const passed = data.exitCode === 0;
    const fields = [
      { name: 'Tool', value: data.toolName, inline: true },
      { name: 'Duration', value: data.duration, inline: true },
    ];
    if (data.total !== undefined) {
      fields.push({ name: 'Results', value: `${data.passed}/${data.total} passed, ${data.failed} failed`, inline: true });
      if (data.failedFiles?.length > 0) {
        fields.push({ name: 'Failed Files', value: data.failedFiles.map(f => `• ${f}`).join('\n'), inline: false });
      }
    } else {
      fields.push({ name: 'Exit Code', value: `${data.exitCode}`, inline: true });
    }
    return {
      embeds: [{
        title: passed ? 'Tool Complete' : 'Tool Failed',
        color: passed ? 0x00c853 : 0xff1744,
        fields,
        timestamp: data.timestamp,
        footer: { text: 'PRISM' },
      }],
    };
  }
  if (event === 'test') {
    return {
      embeds: [{
        title: 'PRISM Webhook Test',
        description: 'Connection established — notifications are working.',
        color: 0x448aff,
        timestamp: new Date().toISOString(),
        footer: { text: 'PRISM' },
      }],
    };
  }
  return { content: JSON.stringify({ event, ...data }) };
}

async function sendWebhookNotification(event, data) {
  try {
    const settings = await loadSettings();
    const webhooks = settings.webhooks || [];
    for (const wh of webhooks) {
      if (!wh.enabled || !wh.url) continue;
      const body = isDiscordWebhook(wh.url) ? buildDiscordPayload(event, data) : { event, ...data };
      fetch(wh.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).catch(err => console.error(`Webhook send failed (${wh.name}):`, err.message));
    }
  } catch (err) {
    console.error('Webhook notification error:', err.message);
  }
}

async function getDirectorySize(dir) {
  let total = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        total += await getDirectorySize(fullPath);
      } else {
        const stat = await fs.stat(fullPath);
        total += stat.size;
      }
    }
  } catch { /* ignore */ }
  return total;
}

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');

function probeVideo(filePath) {
  return new Promise((resolve) => {
    const probe = spawn('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=nb_frames,r_frame_rate,avg_frame_rate,width,height,codec_name:format=duration',
      '-print_format', 'json', filePath
    ]);
    let out = '';
    probe.stdout.on('data', (d) => out += d.toString());
    probe.on('close', (code) => {
      if (code !== 0) { resolve({ totalFrames: 0 }); return; }
      try {
        const data = JSON.parse(out);
        const stream = data.streams?.[0] || {};
        let nbFrames = parseInt(stream.nb_frames, 10);
        const duration = parseFloat(data.format?.duration || 0);
        const fpsStr = stream.avg_frame_rate || stream.r_frame_rate || '0/0';
        const [num, den] = fpsStr.split('/').map(Number);
        const fps = den > 0 ? num / den : 0;
        if (!(nbFrames > 0)) nbFrames = Math.round(duration * fps);
        resolve({
          totalFrames: nbFrames > 0 ? nbFrames : 0,
          width: parseInt(stream.width, 10) || 0,
          height: parseInt(stream.height, 10) || 0,
          codec: stream.codec_name || '',
          duration,
        });
      } catch { resolve({ totalFrames: 0 }); }
    });
  });
}

async function loadQueue() {
  try {
    if (await fs.pathExists(QUEUE_FILE)) {
      queue = await fs.readJson(QUEUE_FILE);
    } else {
      queue = [];
      await fs.ensureDir(CONFIG_DIR);
      await fs.writeJson(QUEUE_FILE, queue);
    }
  } catch (err) { console.error('Load error:', err); queue = []; }
}

async function saveQueue() { try { await fs.writeJson(QUEUE_FILE, queue); } catch (err) { console.error('Save error:', err); } }

function parseEncodeOutput(clean, totalFrames, cropInfo) {
  const result = { progress: -1, muxProgress: -1, stats: {}, cropInfo: null, meta: {} };
  const cropM = clean.match(/Auto-crop:\s*(crop=\S+)/);
  if (cropM) { result.cropInfo = cropM[1]; result.stats.crop = cropM[1]; }
  if (cropInfo) result.stats.crop = cropInfo;
  const fpsM = clean.match(/@\s*([\d.]+)\s*fps/);
  if (fpsM) result.stats.fps = parseFloat(fpsM[1]);
  const brM = clean.match(/([\d.]+)\s*kb\/s/);
  if (brM) result.stats.bitrate = parseFloat(brM[1]);
  const sizeM = clean.match(/Size:\s*([\d.]+)\s*MB/);
  if (sizeM) result.stats.size = parseFloat(sizeM[1]);
  const estSizeM = clean.match(/Size:\s*[\d.]+\s*MB\s*\[([\d.]+)\s*MB\]/);
  if (estSizeM) result.stats.estSize = parseFloat(estSizeM[1]);
  const timeM = clean.match(/Time:\s*([\d:]+)/);
  if (timeM) result.stats.elapsed = timeM[1];
  const etaM = clean.match(/\[-([\d:]+)\]/);
  if (etaM) result.stats.eta = etaM[1];
  const withTotal = clean.match(/(\d+)\s*\/\s*(\d+)\s+Frames/);
  if (withTotal) {
    result.stats.currentFrame = parseInt(withTotal[1], 10);
    result.stats.totalFrames = parseInt(withTotal[2], 10);
    result.progress = Math.min(100, (result.stats.currentFrame / result.stats.totalFrames) * 100);
  } else if (totalFrames > 0) {
    const noTotal = clean.match(/\b(\d+)\s+Frames\b/);
    if (noTotal) {
      result.stats.currentFrame = parseInt(noTotal[1], 10);
      result.stats.totalFrames = totalFrames;
      result.progress = Math.min(100, (result.stats.currentFrame / totalFrames) * 100);
    }
  }
  if (result.progress < 0) {
    const mkv = clean.match(/Progress:\s*(\d+)%/);
    if (mkv) result.muxProgress = parseInt(mkv[1], 10);
  }

  // Parse media metadata lines
  const colorM = clean.match(/==> Color:\s*primaries=(\S+)\s+transfer=(\S+)\s+matrix=(\S+)\s+range=(\S+)/);
  if (colorM) result.meta.color = { primaries: colorM[1], transfer: colorM[2], matrix: colorM[3], range: colorM[4] };
  const srcFpsM = clean.match(/==> Source FPS:\s*([\d.]+)/);
  if (srcFpsM) result.meta.sourceFps = parseFloat(srcFpsM[1]);
  // Audio plan lines: PLAN|idx|mode|bitrate|lang|title|layout
  const planLines = clean.match(/PLAN\|.+/g);
  if (planLines) {
    result.meta.audioTracks = planLines.map(line => {
      const [, idx, mode, bitrate, lang, title, layout] = line.split('|');
      return { index: parseInt(idx, 10), mode, bitrate, lang, title, layout };
    });
  }

  return result;
}

function formatLogLine(line, type, ts) {
  // Skip separator lines and empty SVT noise
  if (/^-{3,}$/.test(line) || /^Svt\[info\]:\s*-{3,}/.test(line) || /^Svt\[info\]:\s*$/.test(line)) return null;

  // Encoding progress telemetry
  const encMatch = line.match(/(?:Encoding:\s*)?(\d+)(?:\s*\/\s*(\d+))?\s+Frames?\s*@\s*([\d.]+)\s*fp[sm]\s*\|\s*([\d.]+)\s*kb\/s\s*\|\s*Size:\s*([\d.]+)\s*MB(?:\s*\[([\d.]+)\s*MB\])?\s*\|\s*Time:\s*([\d:]+)(?:\s*\[-([\d:]+)\])?/);
  if (encMatch) {
    const [, frame, total, fps, bitrate, size, estSize, elapsed, eta] = encMatch;
    const frameStr = total ? `${frame} / ${total}` : frame;
    const sizeStr = estSize ? `${size} / ~${estSize} MB` : `${size} MB`;
    const text = [
      `[PRISM] ${ts} ── ENCODE TELEMETRY ──`,
      `        FRAME: ${frameStr.padEnd(16)} SPEED: ${fps} fps`,
      `        RATE:  ${(bitrate + ' kb/s').padEnd(16)} SIZE:  ${sizeStr}`,
      `        TIME:  ${elapsed.padEnd(16)}${eta ? ' ETA:   ' + eta : ''}`,
    ].join('\n');
    return { type: 'encode', text };
  }

  // Input/output path lines
  const inputM = line.match(/🎬\s*Input\s*:\s*(.+)/);
  if (inputM) return { type: 'init', text: `[PRISM] ${ts} ── FILE ROUTING ──\n        INPUT:  ${inputM[1]}` };
  const outputM = line.match(/(?:➡️\s*)?Output\s*:\s*(.+)/);
  if (outputM) return { type: 'init_append', text: `        OUTPUT: ${outputM[1]}` };

  // Source metadata lines
  const srcFpsM = line.match(/==>\s*Source FPS:\s*(.+)/);
  if (srcFpsM) return { type: 'init', text: `[PRISM] ${ts} ── SOURCE ANALYSIS ──\n        FPS: ${srcFpsM[1]}` };
  const colorM = line.match(/==>\s*Color:\s*primaries=(\S+)\s+transfer=(\S+)\s+matrix=(\S+)\s+range=(\S+)/);
  if (colorM) {
    const rangeStr = colorM[4] === '0' ? 'Limited' : colorM[4] === '1' ? 'Full' : colorM[4];
    return { type: 'init_append', text: `        PRIMARIES: ${colorM[1].padEnd(12)} TRANSFER: ${colorM[2]}\n        MATRIX:    ${colorM[3].padEnd(12)} RANGE:    ${rangeStr}` };
  }
  if (/==>\s*Detecting color/.test(line)) return null;

  // Encoding start line
  const encStartM = line.match(/==>\s*Encoding video\s*\((.+?)\)/);
  if (encStartM) return { type: 'init', text: `[PRISM] ${ts} ── ENCODER ENGAGED ──\n        CONFIG: ${encStartM[1]}` };

  // SVT version/build/config lines
  const svtVerM = line.match(/SVT \[version\]:\s*(.+)/);
  if (svtVerM) return { type: 'init_append', text: `        ENGINE: ${svtVerM[1]}` };
  const svtBuildM = line.match(/SVT \[build\]\s*:\s*(.+)/);
  if (svtBuildM) return { type: 'init_append', text: `        BUILD:  ${svtBuildM[1]}` };
  const svtCfgM = line.match(/SVT \[config\]:\s*(.+?)\s{2,}:\s*(.+)/);
  if (svtCfgM) {
    const key = svtCfgM[1].trim().toUpperCase().replace(/\s*\/\s*/g, ' / ');
    const val = svtCfgM[2].trim();
    return { type: 'init_append', text: `        ${key.padEnd(50)} ${val}` };
  }
  if (/^Svt\[info\]:/.test(line)) return null;
  if (/^Encoding$/.test(line)) return null;

  // Default formatting
  const TAG = type === 'error' ? 'ERR!' : type === 'stderr' ? 'WARN' : 'SYS ';
  return { type, text: `[PRISM] ${ts} [${TAG}] ${line}` };
}

function emitFormattedLog(msg, type = 'info') {
  const raw = stripAnsi(msg).trim();
  if (!raw) return;
  const ts = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 1);
  for (const line of lines) {
    const entry = formatLogLine(line, type, ts);
    if (entry) { console.log(entry.text); io.emit('logs', entry); }
  }
}

class Worker {
  constructor() {
    this.processing = false;
    this.stopping = false;
    this.activeInstances = new Map(); // slotIndex -> { child, file, fileIdx, progress, stats }
    this.completedCount = 0;
    this.totalFiles = 0;
  }

  async start() { if (this.processing) return; this.stopping = false; this.processing = true; this.processNext(); }

  stop() {
    this.stopping = true;
    for (const [, inst] of this.activeInstances) {
      if (inst.child) {
        try { process.kill(-inst.child.pid, 'SIGTERM'); } catch(e) { try { inst.child.kill('SIGTERM'); } catch(e2) {} }
      }
    }
    this.activeInstances.clear();
  }

  async processNext() {
    if (queue.length === 0 || this.stopping || paused) {
      this.processing = false; this.stopping = false; currentJob = null; io.emit('status', { active: false, status: paused ? 'paused' : 'idle' }); return;
    }
    currentJob = queue[0];
    io.emit('queue_update', queue);
    io.emit('status', { active: true, status: 'encoding', activeJob: { name: currentJob.input_folder } });
    try {
      await this.processBatch(currentJob);
      if (!this.stopping) {
        queue.shift();
        await saveQueue();
        io.emit('queue_update', queue);
      }
    } catch (err) {
      console.error('Batch error:', err);
      if (!this.stopping) {
        queue.shift();
        await saveQueue();
        io.emit('queue_update', queue);
      }
    }
    this.processNext();
  }

  async getFilesRecursive(dir) {
    const subdirs = await fs.readdir(dir);
    const files = await Promise.all(subdirs.map(async (subdir) => {
      const res = path.resolve(dir, subdir);
      return (await fs.stat(res)).isDirectory() ? this.getFilesRecursive(res) : res;
    }));
    return files.reduce((a, f) => a.concat(f), []);
  }

  async processBatch(batch) {
    const { input_folder } = batch;
    if (!(await fs.pathExists(input_folder))) { this.log(`PATH NOT FOUND — ${input_folder} — aborting batch`, 'error'); return; }
    const batchStartTime = Date.now();
    const stats = await fs.stat(input_folder);
    let files = [];
    if (stats.isDirectory()) {
      files = await this.getFilesRecursive(input_folder);
      files = files.filter(f => ['.mkv', '.mp4', '.avi', '.ts', '.mov', '.webm'].includes(path.extname(f).toLowerCase()));
      files.sort();
    } else {
      files = [input_folder];
    }

    // Load parallel encoding settings
    const settings = await loadSettings();
    const maxInstances = Math.min(settings.parallelInstances || 1, files.length);
    const totalThreads = os.cpus().length;
    const reservedCores = settings.reservedCores || 0;
    const threadsPerCCD = settings.threadsPerCCD || 0;

    // Compute thread allocations (skip for single instance with no reserved cores)
    const useAffinity = maxInstances > 1 || reservedCores > 0;
    const allocations = useAffinity
      ? computeThreadAllocations(totalThreads, maxInstances, reservedCores, threadsPerCCD)
      : null;

    this.completedCount = 0;
    this.totalFiles = files.length;
    let nextFileIdx = 0;

    const startNext = (slotIndex) => {
      if (nextFileIdx >= files.length || this.stopping) return null;
      const fileIdx = nextFileIdx++;
      const file = files[fileIdx];
      const allocation = allocations ? allocations[slotIndex] || null : null;

      this.activeInstances.set(slotIndex, { child: null, file, fileIdx, progress: 0, stats: {} });
      this.emitParallelStatus(batch);

      const promise = this.encodeFile(file, batch, slotIndex, allocation, (fProg, encStats) => {
        const inst = this.activeInstances.get(slotIndex);
        if (inst) { inst.progress = fProg; inst.stats = encStats; }
        this.emitParallelStatus(batch);
      }).then(() => {
        this.completedCount++;
        this.activeInstances.delete(slotIndex);
        return slotIndex;
      }).catch((err) => {
        this.log(`ENCODE ERROR — ${path.basename(file)} — ${err.message}`, 'error');
        this.completedCount++;
        this.activeInstances.delete(slotIndex);
        return slotIndex;
      });

      return { slotIndex, promise };
    };

    // Fill initial slots
    const running = new Map(); // slotIndex -> promise
    for (let i = 0; i < maxInstances; i++) {
      const result = startNext(i);
      if (result) running.set(result.slotIndex, result.promise);
    }

    // As each finishes, start next file in that slot
    while (running.size > 0 && !this.stopping) {
      const finishedSlot = await Promise.race(running.values());
      running.delete(finishedSlot);
      const next = startNext(finishedSlot);
      if (next) running.set(next.slotIndex, next.promise);
    }

    if (!this.stopping) {
      io.emit('batch_complete', { folder: batch.input_folder });
      // Send webhook notification
      const elapsed = Date.now() - batchStartTime;
      const defaultOutput = path.join(__dirname, '..', '..', 'output');
      const outputRoot = process.env.OUTPUT_DIR || defaultOutput;
      const outputDir = batch.subfolder ? path.join(outputRoot, batch.subfolder) : outputRoot;
      const totalSize = await getDirectorySize(outputDir).catch(() => 0);
      sendWebhookNotification('batch_complete', {
        timestamp: new Date().toISOString(),
        folder: path.basename(batch.input_folder),
        encoder: batch.encoder || 'unknown',
        files: this.totalFiles,
        duration: formatDuration(elapsed),
        totalSize: formatSize(totalSize),
      });
      addHistoryEntry({
        id: uuidv4(), type: 'encode',
        folder: path.basename(batch.input_folder),
        encoder: path.basename(batch.encoder || 'unknown'),
        crf: batch.crf, preset: batch.preset, tune: batch.tune || '',
        customFlags: batch.custom_flags || '', subfolder: batch.subfolder || '',
        files: this.totalFiles, duration: formatDuration(elapsed), totalSize: formatSize(totalSize),
        completedAt: new Date().toISOString(),
      });
    }
  }

  emitParallelStatus(batch) {
    const instances = [];
    for (const [slotIndex, inst] of this.activeInstances) {
      instances.push({
        slotIndex,
        currentFile: path.basename(inst.file),
        currentFilePath: inst.file,
        fileIndex: inst.fileIdx + 1,
        progress: inst.progress || 0,
        ...(inst.stats || {}),
      });
    }

    // Overall progress: completed files + partial progress of active files
    const partialSum = instances.reduce((sum, i) => sum + (i.progress || 0), 0);
    const overallProgress = this.totalFiles > 0
      ? ((this.completedCount / this.totalFiles) * 100) + (partialSum / this.totalFiles)
      : 0;

    const firstInst = instances[0] || {};
    io.emit('status', {
      active: true,
      status: 'encoding',
      activeJob: { name: currentJob?.input_folder || '' },
      progress: overallProgress,
      totalFiles: this.totalFiles,
      completedFiles: this.completedCount,
      queueLength: queue.length,
      encoder: batch.encoder,
      instances,
      // Backwards compat for single-instance: keep top-level fields
      currentFile: firstInst.currentFile,
      currentFilePath: firstInst.currentFilePath,
      fileIndex: firstInst.fileIndex,
      ...firstInst,
    });
  }

  async encodeFile(file, batch, slotIndex, allocation, onProgress) {
    const probeInfo = await probeVideo(file);
    const totalFrames = probeInfo.totalFrames;
    const slotPrefix = this.totalFiles > 1 && this.activeInstances.size > 1 ? `[${slotIndex + 1}] ` : '';
    if (totalFrames > 0) this.log(`${slotPrefix}Target acquired: ${path.basename(file)} — ${totalFrames} frames locked`, 'info');
    else this.log(`${slotPrefix}Target acquired: ${path.basename(file)} — frame count unknown, limited telemetry`, 'info');

    return new Promise((resolve, reject) => {
      const { input_folder, encoder, crf, preset, tune, custom_flags, subfolder, auto_crop, crop, deband, downscale, hdr_to_sdr, tonemap, encode_lossless } = batch;
      const defaultOutput = path.join(__dirname, '..', '..', 'output');
      const outputRoot = process.env.OUTPUT_DIR || defaultOutput;

      // Calculate output directory relative to input_folder to preserve structure
      let outputDir = subfolder ? path.join(outputRoot, subfolder) : outputRoot;

      try {
        const relativePath = path.relative(input_folder, path.dirname(file));
        if (relativePath && relativePath !== '.') {
          outputDir = path.join(outputDir, relativePath);
        }
      } catch (err) {
        console.error('Error calculating relative path:', err);
      }

      // Build custom flags with --lp if using thread allocation
      let effectiveFlags = custom_flags || '';
      if (allocation && allocation.threadCount > 0) {
        effectiveFlags = `${effectiveFlags} --lp ${allocation.threadCount}`.trim();
      }

      const args = [
        '--input', file,
        '--output-dir', outputDir,
        '--encoder', encoder,
        '--crf', crf,
        '--preset', preset,
        '--tune', tune,
        '--custom-flags', effectiveFlags,
        '--auto-crop', auto_crop ? '1' : '0',
        '--deband', deband?.enabled ? '1' : '0',
        ...(deband?.range ? ['--deband-range', String(deband.range)] : []),
        ...(deband?.threshold ? ['--deband-threshold', String(deband.threshold)] : []),
        '--encode-lossless', encode_lossless === false ? '0' : '1',
        '--hdr-to-sdr', hdr_to_sdr ? '1' : '0',
        ...(hdr_to_sdr && tonemap ? ['--tonemap', String(tonemap)] : []),
        ...(downscale ? ['--downscale', String(downscale)] : []),
        '--rename-audio', '0'
      ];

      if (crop) args.push('--crop', crop);

      // Spawn with taskset if available and allocation exists
      let spawnCmd, spawnArgs;
      if (allocation && tasksetAvailable) {
        spawnCmd = 'taskset';
        spawnArgs = ['--cpu-list', allocation.cpuList, 'bash', path.join(SCRIPTS_DIR, 'encode_single.sh'), ...args];
      } else {
        spawnCmd = 'bash';
        spawnArgs = [path.join(SCRIPTS_DIR, 'encode_single.sh'), ...args];
      }

      const child = spawn(spawnCmd, spawnArgs, { detached: true });
      const inst = this.activeInstances.get(slotIndex);
      if (inst) inst.child = child;

      let cropInfo = null;
      let fileMeta = {
        resolution: probeInfo.width && probeInfo.height ? `${probeInfo.width}x${probeInfo.height}` : null,
        sourceCodec: probeInfo.codec || null,
        duration: probeInfo.duration || null,
      };
      const parseOutput = (out) => {
        const result = parseEncodeOutput(stripAnsi(out), totalFrames, cropInfo);
        if (result.cropInfo) { cropInfo = result.cropInfo; }
        if (result.meta.color) fileMeta.color = result.meta.color;
        if (result.meta.sourceFps) fileMeta.sourceFps = result.meta.sourceFps;
        if (result.meta.audioTracks) fileMeta.audioTracks = result.meta.audioTracks;
        if (result.progress >= 0) { onProgress(result.progress, { ...result.stats, fileMeta }); return; }
        if (result.muxProgress >= 0) { onProgress(result.muxProgress, { phase: 'muxing', fileMeta }); }
      };

      child.stdout.on('data', (d) => { const out = d.toString(); this.log(`${slotPrefix}${out}`, 'stdout'); parseOutput(out); });
      child.stderr.on('data', (d) => { const out = d.toString(); this.log(`${slotPrefix}${out}`, 'stderr'); parseOutput(out); });

      child.on('close', (code) => {
        if (code !== 0 && code !== null) {
          this.log(`${slotPrefix}ENCODE FAILED — ${path.basename(file)} — exit code ${code}`, 'error');
          if (!this.stopping) {
            sendWebhookNotification('encode_error', {
              timestamp: new Date().toISOString(),
              folder: path.basename(batch.input_folder),
              file: path.basename(file),
              exitCode: code,
            });
          }
        } else if (code !== 0) {
          this.log(`${slotPrefix}ENCODE FAILED — ${path.basename(file)} — exit code ${code}`, 'error');
        } else {
          this.log(`${slotPrefix}ENCODE COMPLETE — ${path.basename(file)} — all systems nominal`, 'info');
        }
        resolve();
      });
    });
  }

  log(msg, type = 'info') { emitFormattedLog(msg, type); }
}

const worker = new Worker();
const frontendDist = path.join(__dirname, '../client/dist');
if (fs.existsSync(frontendDist)) app.use(express.static(frontendDist));

// --- System Metrics ---
let lastCpuUsage = 0;
let lastPerCore = [];

function snapshotCPUs() {
  return os.cpus().map(c => {
    const t = c.times;
    const total = t.user + t.nice + t.sys + t.idle + t.irq;
    return { idle: t.idle, total };
  });
}

let lastSnap = snapshotCPUs();
setInterval(() => {
  const snap = snapshotCPUs();
  let totalIdle = 0, totalAll = 0;
  lastPerCore = snap.map((cur, i) => {
    const prev = lastSnap[i];
    const dTotal = cur.total - prev.total;
    const dIdle = cur.idle - prev.idle;
    totalIdle += dIdle;
    totalAll += dTotal;
    return dTotal > 0 ? 100 * (1 - dIdle / dTotal) : 0;
  });
  if (totalAll > 0) lastCpuUsage = 100 * (1 - totalIdle / totalAll);
  lastSnap = snap;
}, 2000);

app.get('/api/system/metrics', (req, res) => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  res.json({
    cpu: lastCpuUsage,
    perCore: lastPerCore,
    cores: os.cpus().length,
    mem: {
      total: totalMem,
      free: freeMem,
      used: usedMem,
      percentage: (usedMem / totalMem) * 100
    },
    uptime: os.uptime(),
    loadAvg: os.loadavg()
  });
});

app.get('/api/system/thread-preview', async (req, res) => {
  const settings = await loadSettings();
  const totalThreads = os.cpus().length;
  const instances = parseInt(req.query.instances) || settings.parallelInstances || 1;
  const reserved = parseInt(req.query.reserved) || settings.reservedCores || 0;
  const perCCD = parseInt(req.query.perCCD) || settings.threadsPerCCD || 0;
  const allocations = computeThreadAllocations(totalThreads, instances, reserved, perCCD);
  res.json({ totalThreads, allocations, tasksetAvailable });
});

// --- Waveform Generation ---
const waveformCache = new Map();
app.get('/api/waveform', (req, res) => {
  const file = req.query.file;
  if (!file) return res.status(400).json({ error: 'file parameter required' });
  if (waveformCache.has(file)) return res.json(waveformCache.get(file));

  const NUM_PEAKS = 500;
  // Use lavfi to compute per-segment peak amplitude directly in ffmpeg
  // This avoids buffering the entire decoded audio in memory
  const probe = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-print_format', 'json', file]);
  let probeOut = '';
  probe.stdout.on('data', d => probeOut += d.toString());
  probe.stderr.on('data', () => {});
  probe.on('close', () => {
    let duration = 0;
    try { duration = parseFloat(JSON.parse(probeOut).format?.duration || 0); } catch {}
    if (duration <= 0) return res.json({ peaks: [], duration: 0 });

    // Sample rate chosen so total samples ≈ NUM_PEAKS * samplesPerBin
    // Use a small samplesPerBin (16) so we get manageable data (~32KB for 500 peaks)
    const samplesPerBin = 16;
    const sampleRate = Math.max(1, Math.round((NUM_PEAKS * samplesPerBin) / duration));
    const ff = spawn('ffmpeg', [
      '-i', file, '-vn', '-ac', '1',
      '-ar', String(sampleRate),
      '-f', 'f32le', 'pipe:1'
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    const chunks = [];
    ff.stdout.on('data', d => chunks.push(d));
    ff.stderr.on('data', () => {});
    ff.on('close', (code) => {
      if (code !== 0 || chunks.length === 0) return res.json({ peaks: [], duration });
      const raw = Buffer.concat(chunks);
      // Copy to aligned ArrayBuffer for Float32Array compatibility
      const aligned = new ArrayBuffer(raw.length);
      new Uint8Array(aligned).set(raw);
      const samples = new Float32Array(aligned);
      const binSize = Math.max(1, Math.floor(samples.length / NUM_PEAKS));
      const peaks = [];
      for (let i = 0; i < NUM_PEAKS && i * binSize < samples.length; i++) {
        let max = 0;
        const end = Math.min((i + 1) * binSize, samples.length);
        for (let j = i * binSize; j < end; j++) {
          const abs = Math.abs(samples[j]);
          if (abs > max) max = abs;
        }
        peaks.push(Math.min(max, 1));
      }
      const result = { peaks, duration };
      waveformCache.set(file, result);
      res.json(result);
    });
  });
});

app.get('/api/browse', async (req, res) => {
  const fullPath = req.query.path || '/';
  try {
    const files = await fs.readdir(fullPath);
    const result = [];
    const ignoreAtRoot = (process.env.BROWSE_HIDE_ROOT ?? 'proc,sys,dev,run,boot,etc,var,lib,lib64,bin,sbin,usr,opt,root,srv,tmp').split(',').map(s => s.trim()).filter(Boolean);
    for (const file of files) {
      if (fullPath === '/' && ignoreAtRoot.includes(file)) continue;
      if (file.startsWith('.')) continue;
      const filePath = path.join(fullPath, file);
      try {
        const stats = await fs.stat(filePath);
        if (stats.isDirectory()) result.push({ name: file, isDirectory: true, path: filePath });
        else result.push({ name: file, isDirectory: false, path: filePath, size: stats.size });
      } catch (e) {}
    }
    result.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const parseBuildScript = async (name) => {
  const scriptPath = path.join(ROOT_DIR, `build_${name}.sh`);
  try {
    const content = await fs.readFile(scriptPath, 'utf8');
    const repoMatch = content.match(/REPO_URL="\$\{REPO_URL:-(.+?)\}"/);
    const branchMatch = content.match(/BRANCH="\$\{BRANCH:-(.+?)\}"/);
    return { repoUrl: repoMatch?.[1] || null, defaultBranch: branchMatch?.[1] || 'main' };
  } catch { return { repoUrl: null, defaultBranch: 'main' }; }
};

app.get('/api/encoders', async (req, res) => {
  try {
    const rootFiles = await fs.readdir(ROOT_DIR);
    const buildable = rootFiles.filter(f => f.startsWith('build_') && f.endsWith('.sh')).map(f => f.replace('build_', '').replace('.sh', ''));
    const result = await Promise.all(buildable.map(async name => {
      const prefix = path.join(ENCODERS_DIR, name);
      const isInstalled = await fs.pathExists(path.join(prefix, 'bin/SvtAv1EncApp')) || await fs.pathExists(path.join(prefix, 'bin', name));
      let binaryPath = path.join(prefix, 'bin', name);
      if (!(await fs.pathExists(binaryPath))) binaryPath = path.join(prefix, 'bin/SvtAv1EncApp');
      const { defaultBranch } = await parseBuildScript(name);
      return { name, isInstalled, path: binaryPath, defaultBranch };
    }));
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/encoders/:name/branches', async (req, res) => {
  const { name } = req.params;
  const { repoUrl, defaultBranch } = await parseBuildScript(name);
  if (!repoUrl) return res.status(404).json({ error: 'Unknown encoder or no repo URL' });
  try {
    const child = spawn('git', ['ls-remote', '--heads', repoUrl]);
    let out = '';
    child.stdout.on('data', (d) => out += d.toString());
    child.on('close', (code) => {
      if (code !== 0) return res.status(500).json({ error: 'git ls-remote failed' });
      const branches = out.trim().split('\n').filter(Boolean).map(line => {
        const ref = line.split('\t')[1] || '';
        return ref.replace('refs/heads/', '');
      }).filter(Boolean).sort((a, b) => {
        if (a === defaultBranch) return -1;
        if (b === defaultBranch) return 1;
        return a.localeCompare(b);
      });
      res.json({ branches, defaultBranch });
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/encoders/:name/build', async (req, res) => {
  const { name } = req.params; const { branch } = req.body;
  if (isBuilding) return res.status(400).json({ error: 'Busy' });
  isBuilding = true;
  io.emit('status', { active: true, status: 'building', activeJob: { name: `Building ${name}` } });
  const args = branch ? ['--branch', branch] : [];
  const child = spawn('bash', [path.join(ROOT_DIR, `build_${name}.sh`), ...args]);
  child.stdout.on('data', (d) => io.emit('build_logs', { encoder: name, log: d.toString() }));
  child.stderr.on('data', (d) => io.emit('build_logs', { encoder: name, log: d.toString() }));
  child.on('close', (code) => {
    isBuilding = false; io.emit('build_complete', { name, success: code === 0 });
    io.emit('status', worker.processing ? { status: 'encoding', job: currentJob } : { status: 'idle' });
  });
  res.json({ message: 'Started' });
});

app.get('/api/queue', (req, res) => res.json(queue));
app.post('/api/queue', async (req, res) => {
  if (testEncodeRunning) return res.status(400).json({ error: 'A test encode is running — wait for it to finish' });
  const batch = { id: uuidv4(), ...req.body, addedAt: new Date().toISOString() };
  queue.push(batch); await saveQueue(); io.emit('queue_update', queue);
  if (!worker.processing && !isBuilding) worker.start();
  res.json(batch);
});
app.delete('/api/queue/:id', async (req, res) => {
  const idx = queue.findIndex(b => b.id === req.params.id);
  if (idx !== -1) { queue.splice(idx, 1); await saveQueue(); io.emit('queue_update', queue); res.json({ success: true }); }
  else res.status(404).json({ error: 'Missing' });
});
app.post('/api/queue/:id/move', async (req, res) => {
  const { direction } = req.body;
  const idx = queue.findIndex(b => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const newIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (newIdx < 0 || newIdx >= queue.length) return res.json({ success: false, message: 'Already at edge' });
  [queue[idx], queue[newIdx]] = [queue[newIdx], queue[idx]];
  await saveQueue(); io.emit('queue_update', queue);
  res.json({ success: true });
});
app.get('/api/status', (req, res) => {
  res.json(getCurrentStatus());
});

app.post('/api/pause', async (req, res) => {
  if (worker.processing) {
    paused = true;
    worker.stop();
    currentJob = null;
    io.emit('status', { active: false, status: 'paused' });
    io.emit('queue_update', queue);
    res.json({ success: true });
  } else {
    res.json({ success: false, message: 'Nothing running' });
  }
});

app.post('/api/resume', async (req, res) => {
  if (worker.processing) return res.json({ success: false, message: 'Already running' });
  if (testEncodeRunning) return res.status(400).json({ error: 'A test encode is running — wait for it to finish' });
  if (queue.length === 0) return res.json({ success: false, message: 'Queue is empty' });
  paused = false;
  worker.start();
  res.json({ success: true });
});

app.post('/api/stop', async (req, res) => {
  if (worker.processing) {
    paused = false;
    worker.stop();
    if (currentJob && queue.length > 0 && queue[0].id === currentJob.id) {
      queue.shift();
      await saveQueue();
      io.emit('queue_update', queue);
    }
    currentJob = null;
    io.emit('status', { active: false, status: 'idle' });
    res.json({ success: true });
  } else if (paused && queue.length > 0) {
    paused = false;
    queue.shift();
    await saveQueue();
    io.emit('queue_update', queue);
    io.emit('status', { active: false, status: 'idle' });
    res.json({ success: true });
  } else {
    res.json({ success: false, message: 'Nothing running' });
  }
});

app.post('/api/queue/clear', async (req, res) => {
  if (worker.processing) {
    worker.stop();
    currentJob = null;
  }
  paused = false;
  queue = [];
  await saveQueue();
  io.emit('queue_update', queue);
  io.emit('status', { active: false, status: 'idle' });
  res.json({ success: true });
});

// --- Settings API ---
app.get('/api/settings', async (req, res) => {
  try { res.json(await loadSettings()); } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/settings', async (req, res) => {
  try { const settings = { ...(await loadSettings()), ...req.body }; await saveSettings(settings); res.json(settings); } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Webhook Test API ---
app.post('/api/webhooks/test', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const body = isDiscordWebhook(url)
      ? buildDiscordPayload('test', {})
      : { event: 'test', message: 'PRISM webhook test — connection established.', timestamp: new Date().toISOString() };
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return res.status(resp.status).json({ error: `Webhook returned ${resp.status}`, detail: text });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Favorites API ---
app.post('/api/favorites/toggle', async (req, res) => {
  const { path: dirPath } = req.body;
  if (!dirPath) return res.status(400).json({ error: 'path required' });
  try {
    const settings = await loadSettings();
    const favorites = settings.favorites || [];
    const idx = favorites.indexOf(dirPath);
    if (idx === -1) favorites.push(dirPath);
    else favorites.splice(idx, 1);
    settings.favorites = favorites;
    await saveSettings(settings);
    res.json({ favorites });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Audio Scanner API ---
app.get('/api/audio-scanner/scan', async (req, res) => {
  const dir = req.query.dir;
  if (!dir) return res.status(400).json({ error: 'dir required' });
  try {
    const entries = await fs.readdir(dir);
    const mkvFiles = entries.filter(f => f.toLowerCase().endsWith('.mkv') && !f.toLowerCase().endsWith('.tmp.mkv')).sort();
    if (mkvFiles.length === 0) return res.status(404).json({ error: 'No MKV files found in directory' });

    const probeFile = (file) => new Promise((resolve, reject) => {
      const filePath = path.join(dir, file);
      const proc = spawn('mkvmerge', ['-J', filePath]);
      let out = '';
      proc.stdout.on('data', d => out += d.toString());
      proc.on('close', code => {
        if (code !== 0) return reject(new Error(`mkvmerge failed for ${file}`));
        try { resolve({ file, filePath, data: JSON.parse(out) }); } catch { reject(new Error(`Parse failed for ${file}`)); }
      });
    });

    // Probe up to 4 files at a time
    const results = [];
    for (let i = 0; i < mkvFiles.length; i += 4) {
      const batch = mkvFiles.slice(i, i + 4).map(f => probeFile(f).catch(err => ({ file: f, filePath: path.join(dir, f), error: err.message })));
      results.push(...await Promise.all(batch));
    }

    const files = results.map(r => {
      if (r.error) return { path: r.filePath, name: r.file, audioTracks: [], error: r.error };
      let audioIdx = 0;
      const audioTracks = (r.data.tracks || []).filter(t => t.type === 'audio').map(t => ({
        index: ++audioIdx,
        id: t.id,
        language: t.properties?.language || 'und',
        name: t.properties?.track_name || '',
        codec: t.codec || '',
        channels: t.properties?.audio_channels || 0,
      }));
      return { path: r.filePath, name: r.file, audioTracks };
    });

    // Baseline = most common audio track count
    const counts = files.filter(f => !f.error).map(f => f.audioTracks.length);
    const freq = {};
    counts.forEach(c => freq[c] = (freq[c] || 0) + 1);
    const baseline = Number(Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || 0);

    files.forEach(f => { f.hasExtra = f.audioTracks.length > baseline; f.hasFewer = f.audioTracks.length < baseline; });
    // Sort: extra first, then fewer, then normal
    files.sort((a, b) => (b.hasExtra - a.hasExtra) || (b.hasFewer - a.hasFewer) || a.name.localeCompare(b.name));

    res.json({ baseline, totalFiles: files.length, extraCount: files.filter(f => f.hasExtra).length, files });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/audio-scanner/rename', async (req, res) => {
  const { file, tracks } = req.body;
  if (!file || !tracks || !Array.isArray(tracks)) return res.status(400).json({ error: 'file and tracks[] required' });

  const args = [file];
  for (const t of tracks) {
    const setters = [];
    if (t.name !== undefined) setters.push(`name=${t.name}`);
    if (t.language) setters.push(`language=${t.language}`);
    if (setters.length === 0) continue;
    args.push('--edit', `track:a${t.index}`);
    for (const s of setters) args.push('--set', s);
  }
  if (args.length === 1) return res.json({ success: true, noop: true });

  try {
    await new Promise((resolve, reject) => {
      const proc = spawn('mkvpropedit', args);
      let stderr = '';
      proc.stderr.on('data', d => stderr += d.toString());
      proc.on('close', code => code === 0 ? resolve() : reject(new Error(stderr || 'mkvpropedit failed')));
    });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/audio-scanner/remove-tracks', async (req, res) => {
  const { file, files, keepTrackIds, keepIndices } = req.body;

  const processFile = async (filePath, ids) => {
    const csv = ids.join(',');
    const tmp = filePath.replace(/\.mkv$/i, '.tmp.mkv');
    try {
      await new Promise((resolve, reject) => {
        const proc = spawn('mkvmerge', ['-o', tmp, '--audio-tracks', csv, filePath]);
        let stderr = '';
        proc.stderr.on('data', d => stderr += d.toString());
        proc.on('close', code => code === 0 ? resolve() : reject(new Error(stderr || 'mkvmerge failed')));
      });
      await fs.move(tmp, filePath, { overwrite: true });
    } catch (err) {
      await fs.remove(tmp).catch(() => {});
      throw err;
    }
  };

  try {
    if (file && keepTrackIds) {
      // Single file mode: keepTrackIds are MKV track IDs
      await processFile(file, keepTrackIds);
      res.json({ success: true, processed: 1 });
    } else if (files && keepIndices) {
      // Batch mode: keepIndices are 0-based audio track positions
      // Need to probe each file to get actual track IDs at those positions
      let processed = 0;
      const errors = [];
      for (const f of files) {
        try {
          const probe = await new Promise((resolve, reject) => {
            const proc = spawn('mkvmerge', ['-J', f]);
            let out = '';
            proc.stdout.on('data', d => out += d.toString());
            proc.on('close', code => {
              if (code !== 0) return reject(new Error(`probe failed for ${path.basename(f)}`));
              try { resolve(JSON.parse(out)); } catch { reject(new Error(`parse failed for ${path.basename(f)}`)); }
            });
          });
          const audioTracks = (probe.tracks || []).filter(t => t.type === 'audio');
          const ids = keepIndices.filter(i => i < audioTracks.length).map(i => audioTracks[i].id);
          if (ids.length === 0 || ids.length === audioTracks.length) {
            io.emit('tool_output', `[skip] ${path.basename(f)} — ${ids.length === 0 ? 'no matching tracks' : 'nothing to remove'}\n`);
            continue;
          }
          io.emit('tool_output', `[${processed + 1}/${files.length}] Removing tracks from ${path.basename(f)}...\n`);
          await processFile(f, ids);
          processed++;
          io.emit('tool_output', `[done] ${path.basename(f)}\n`);
        } catch (err) {
          errors.push({ file: path.basename(f), error: err.message });
          io.emit('tool_output', `[error] ${path.basename(f)}: ${err.message}\n`);
        }
      }
      io.emit('tool_output', `\nTrack removal complete: ${processed} processed${errors.length ? `, ${errors.length} failed` : ''}\n`);
      res.json({ success: true, processed, errors });
    } else {
      res.status(400).json({ error: 'Provide {file, keepTrackIds} or {files, keepIndices}' });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Subtitle Scanner API ---
app.get('/api/subtitle-scanner/scan', async (req, res) => {
  const dir = req.query.dir;
  if (!dir) return res.status(400).json({ error: 'dir required' });
  try {
    const entries = await fs.readdir(dir);
    const mkvFiles = entries.filter(f => f.toLowerCase().endsWith('.mkv') && !f.toLowerCase().endsWith('.tmp.mkv')).sort();
    if (mkvFiles.length === 0) return res.status(404).json({ error: 'No MKV files found in directory' });

    const probeFile = (file) => new Promise((resolve, reject) => {
      const filePath = path.join(dir, file);
      const proc = spawn('mkvmerge', ['-J', filePath]);
      let out = '';
      proc.stdout.on('data', d => out += d.toString());
      proc.on('close', code => {
        if (code !== 0) return reject(new Error(`mkvmerge failed for ${file}`));
        try { resolve({ file, filePath, data: JSON.parse(out) }); } catch { reject(new Error(`Parse failed for ${file}`)); }
      });
    });

    const results = [];
    for (let i = 0; i < mkvFiles.length; i += 4) {
      const batch = mkvFiles.slice(i, i + 4).map(f => probeFile(f).catch(err => ({ file: f, filePath: path.join(dir, f), error: err.message })));
      results.push(...await Promise.all(batch));
    }

    const files = results.map(r => {
      if (r.error) return { path: r.filePath, name: r.file, subtitleTracks: [], error: r.error };
      let subIdx = 0;
      const subtitleTracks = (r.data.tracks || []).filter(t => t.type === 'subtitles').map(t => ({
        index: ++subIdx,
        id: t.id,
        language: t.properties?.language || 'und',
        name: t.properties?.track_name || '',
        codec: t.codec || '',
        forced: !!t.properties?.forced_track,
        defaultTrack: !!t.properties?.default_track,
      }));
      return { path: r.filePath, name: r.file, subtitleTracks };
    });

    const counts = files.filter(f => !f.error).map(f => f.subtitleTracks.length);
    const freq = {};
    counts.forEach(c => freq[c] = (freq[c] || 0) + 1);
    const baseline = Number(Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || 0);

    files.forEach(f => { f.hasExtra = f.subtitleTracks.length > baseline; f.hasFewer = f.subtitleTracks.length < baseline; });
    files.sort((a, b) => (b.hasExtra - a.hasExtra) || (b.hasFewer - a.hasFewer) || a.name.localeCompare(b.name));

    res.json({ baseline, totalFiles: files.length, extraCount: files.filter(f => f.hasExtra).length, files });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/subtitle-scanner/rename', async (req, res) => {
  const { file, tracks } = req.body;
  if (!file || !tracks || !Array.isArray(tracks)) return res.status(400).json({ error: 'file and tracks[] required' });

  const args = [file];
  for (const t of tracks) {
    args.push('--edit', `track:s${t.index}`, '--set', `name=${t.name}`);
  }

  try {
    await new Promise((resolve, reject) => {
      const proc = spawn('mkvpropedit', args);
      let stderr = '';
      proc.stderr.on('data', d => stderr += d.toString());
      proc.on('close', code => code === 0 ? resolve() : reject(new Error(stderr || 'mkvpropedit failed')));
    });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/subtitle-scanner/remove-tracks', async (req, res) => {
  const { file, files, keepTrackIds, keepIndices } = req.body;

  const processFile = async (filePath, ids) => {
    const csv = ids.join(',');
    const tmp = filePath.replace(/\.mkv$/i, '.tmp.mkv');
    try {
      await new Promise((resolve, reject) => {
        const proc = spawn('mkvmerge', ['-o', tmp, '--subtitle-tracks', csv, filePath]);
        let stderr = '';
        proc.stderr.on('data', d => stderr += d.toString());
        proc.on('close', code => code === 0 ? resolve() : reject(new Error(stderr || 'mkvmerge failed')));
      });
      await fs.move(tmp, filePath, { overwrite: true });
    } catch (err) {
      await fs.remove(tmp).catch(() => {});
      throw err;
    }
  };

  try {
    if (file && keepTrackIds) {
      await processFile(file, keepTrackIds);
      res.json({ success: true, processed: 1 });
    } else if (files && keepIndices) {
      let processed = 0;
      const errors = [];
      for (const f of files) {
        try {
          const probe = await new Promise((resolve, reject) => {
            const proc = spawn('mkvmerge', ['-J', f]);
            let out = '';
            proc.stdout.on('data', d => out += d.toString());
            proc.on('close', code => {
              if (code !== 0) return reject(new Error(`probe failed for ${path.basename(f)}`));
              try { resolve(JSON.parse(out)); } catch { reject(new Error(`parse failed for ${path.basename(f)}`)); }
            });
          });
          const subTracks = (probe.tracks || []).filter(t => t.type === 'subtitles');
          const ids = keepIndices.filter(i => i < subTracks.length).map(i => subTracks[i].id);
          if (ids.length === 0 || ids.length === subTracks.length) {
            io.emit('tool_output', `[skip] ${path.basename(f)} — ${ids.length === 0 ? 'no matching tracks' : 'nothing to remove'}\n`);
            continue;
          }
          io.emit('tool_output', `[${processed + 1}/${files.length}] Removing tracks from ${path.basename(f)}...\n`);
          await processFile(f, ids);
          processed++;
          io.emit('tool_output', `[done] ${path.basename(f)}\n`);
        } catch (err) {
          errors.push({ file: path.basename(f), error: err.message });
          io.emit('tool_output', `[error] ${path.basename(f)}: ${err.message}\n`);
        }
      }
      io.emit('tool_output', `\nTrack removal complete: ${processed} processed${errors.length ? `, ${errors.length} failed` : ''}\n`);
      res.json({ success: true, processed, errors });
    } else {
      res.status(400).json({ error: 'Provide {file, keepTrackIds} or {files, keepIndices}' });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Tools API ---
app.get('/api/tools', async (req, res) => {
  try { const registry = await fs.readJson(TOOL_REGISTRY_FILE); res.json(registry); } catch (err) { res.status(500).json({ error: err.message }); }
});

async function findMkvsRecursively(dir, recursive = true) {
  const out = [];
  const walk = async (d) => {
    let entries;
    try { entries = await fs.readdir(d, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (recursive) await walk(p);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.mkv')) {
        out.push(p);
      }
    }
  };
  await walk(dir);
  out.sort();
  return out;
}

function extractEpisodeToken(name) {
  const m = name.match(/[sS](\d{1,2})[eE](\d{1,3})/);
  if (!m) return null;
  return `S${m[1].padStart(2, '0')}E${m[2].padStart(2, '0')}`;
}

app.get('/api/tools/probe', async (req, res) => {
  const dirPath = req.query.path;
  const recursive = req.query.recursive === '1';
  if (!dirPath) return res.status(400).json({ error: 'path required' });
  try {
    let filePath;
    if (recursive) {
      const all = await findMkvsRecursively(dirPath, true);
      filePath = all[0];
    } else {
      const files = await fs.readdir(dirPath);
      const mkv = files.find(f => f.toLowerCase().endsWith('.mkv'));
      if (mkv) filePath = path.join(dirPath, mkv);
    }
    if (!filePath) return res.status(404).json({ error: 'No MKV found in directory' });
    const probe = spawn('mkvmerge', ['-J', filePath]);
    let out = '';
    probe.stdout.on('data', (d) => out += d.toString());
    probe.on('close', (code) => {
      if (code !== 0) return res.status(500).json({ error: 'mkvmerge probe failed' });
      try { res.json(JSON.parse(out)); } catch { res.status(500).json({ error: 'Failed to parse probe output' }); }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/mux/pairs', async (req, res) => {
  const { videoDir, tracksDir } = req.query;
  const recursive = req.query.recursive !== '0';
  const mirrorFrom = req.query.mirrorFrom === 'tracks' ? 'tracks' : 'video';
  if (!videoDir || !tracksDir) return res.status(400).json({ error: 'videoDir and tracksDir required' });
  try {
    const [videos, tracks] = await Promise.all([
      findMkvsRecursively(videoDir, recursive),
      findMkvsRecursively(tracksDir, recursive),
    ]);
    const tracksByToken = {};
    for (const t of tracks) {
      const tok = extractEpisodeToken(path.basename(t));
      if (tok && !tracksByToken[tok]) tracksByToken[tok] = t;
    }
    const pairs = [];
    const unmatchedVideo = [];
    const matchedTrackPaths = new Set();
    for (const v of videos) {
      const tok = extractEpisodeToken(path.basename(v));
      if (!tok) { unmatchedVideo.push(path.basename(v)); continue; }
      const t = tracksByToken[tok];
      if (!t) { unmatchedVideo.push(path.basename(v)); continue; }
      matchedTrackPaths.add(t);
      const mirrorRoot = mirrorFrom === 'tracks' ? tracksDir : videoDir;
      const mirrorFile = mirrorFrom === 'tracks' ? t : v;
      const rel = path.relative(mirrorRoot, mirrorFile);
      pairs.push({ token: tok, video: v, tracks: t, outRel: rel });
    }
    const unmatchedTracks = tracks.filter(t => !matchedTrackPaths.has(t)).map(t => path.basename(t));
    res.json({ pairs, unmatchedVideo, unmatchedTracks });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/tools/:id/run', async (req, res) => {
  if (toolRunning) return res.status(400).json({ error: 'A tool is already running' });
  let registry;
  try { registry = await fs.readJson(TOOL_REGISTRY_FILE); } catch (err) { return res.status(500).json({ error: 'Cannot read tool registry' }); }
  const tool = registry.find(t => t.id === req.params.id);
  if (!tool) return res.status(404).json({ error: 'Tool not found' });

  const scriptPath = path.join(TOOLS_DIR, tool.script);
  if (!(await fs.pathExists(scriptPath))) return res.status(404).json({ error: 'Script not found on disk' });

  const settings = await loadSettings();
  const envVars = { ...process.env, ...(req.body.env || {}) };
  // Inject settings into env
  if (settings.releaseGroup) envVars.RELEASE_GROUP = envVars.RELEASE_GROUP || settings.releaseGroup;

  // For rename_tracks, auto-construct VIDEO_NAME from RELEASE_GROUP if not set
  if (tool.id === 'rename_tracks' && !envVars.VIDEO_NAME && settings.releaseGroup) {
    envVars.VIDEO_NAME = `${settings.releaseGroup} AV1`;
  }

  // For rename_files, auto-construct PREFIX from RELEASE_GROUP if not set
  if (tool.id === 'rename_files' && !envVars.PREFIX && settings.releaseGroup) {
    envVars.PREFIX = `[${settings.releaseGroup}]`;
  }

  toolRunning = true;
  const runId = uuidv4();
  const toolNotify = !!req.body.notify;
  currentToolBuffer = [];
  currentToolMeta = { id: runId, toolId: tool.id, toolName: tool.name, startedAt: new Date().toISOString(), env: req.body.env || {} };
  io.emit('tool_status', { running: true, toolId: tool.id, toolName: tool.name });

  // Use the first absolute path the user provided as cwd, so relative defaults (e.g. "Output") resolve sensibly
  const toolCwd = [envVars.INPUT_DIR, envVars.TARGET_DIR, envVars.OUT_DIR, envVars.OUTPUT_DIR].find(p => p && path.isAbsolute(p)) || ROOT_DIR;
  const child = spawn('bash', [scriptPath], { env: envVars, cwd: toolCwd });
  currentToolChild = child;

  const bufferOutput = (d) => {
    const clean = stripAnsi(d.toString());
    io.emit('tool_output', clean);
    if (currentToolBuffer.length < MAX_TOOL_OUTPUT_LINES) currentToolBuffer.push(clean);
  };
  child.stdout.on('data', bufferOutput);
  child.stderr.on('data', bufferOutput);
  child.on('close', async (code) => {
    currentToolChild = null;
    toolRunning = false;
    const exitLine = `\n[Process exited with code ${code}]\n`;
    io.emit('tool_output', exitLine);
    if (currentToolBuffer.length < MAX_TOOL_OUTPUT_LINES) currentToolBuffer.push(exitLine);
    io.emit('tool_status', { running: false, toolId: tool.id, toolName: tool.name, exitCode: code });

    // Save to history
    if (currentToolMeta) {
      const elapsed = Date.now() - new Date(currentToolMeta.startedAt).getTime();
      const entry = {
        id: currentToolMeta.id, type: 'tool', toolId: tool.id, toolName: tool.name,
        startedAt: currentToolMeta.startedAt, completedAt: new Date().toISOString(),
        exitCode: code, env: currentToolMeta.env,
      };
      try {
        await fs.ensureDir(HISTORY_DIR);
        await fs.writeFile(path.join(HISTORY_DIR, `${entry.id}.log`), currentToolBuffer.join(''));
      } catch (err) { console.error('History log write error:', err); }
      await addHistoryEntry(entry);

      // Send webhook if user opted in
      if (toolNotify) {
        const webhookData = {
          timestamp: new Date().toISOString(),
          toolId: tool.id,
          toolName: tool.name,
          exitCode: code,
          duration: formatDuration(elapsed),
        };
        // Parse verify_integrity summary from output
        if (tool.id === 'verify_integrity') {
          const fullOutput = currentToolBuffer.join('');
          const totalMatch = fullOutput.match(/Total:\s+(\d+)/);
          const passedMatch = fullOutput.match(/Passed:\s+(\d+)/);
          const failedMatch = fullOutput.match(/Failed:\s+(\d+)/);
          if (totalMatch) webhookData.total = parseInt(totalMatch[1]);
          if (passedMatch) webhookData.passed = parseInt(passedMatch[1]);
          if (failedMatch) webhookData.failed = parseInt(failedMatch[1]);
          const failedSection = fullOutput.match(/FAILED FILES:\n([\s\S]*?)(?:\n\n|$)/);
          if (failedSection) {
            webhookData.failedFiles = failedSection[1].trim().split('\n').map(l => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean);
          }
        }
        sendWebhookNotification('tool_complete', webhookData);
      }
    }
  });

  res.json({ message: 'Tool started', toolId: tool.id });
});

app.post('/api/tools/:id/stop', (req, res) => {
  if (!currentToolChild) return res.json({ success: false, message: 'No tool running' });
  try { currentToolChild.kill('SIGTERM'); } catch (e) { console.error('Kill error:', e); }
  res.json({ success: true });
});

app.get('/api/tools/current-output', (req, res) => {
  res.json({ meta: currentToolMeta, output: currentToolBuffer, running: toolRunning });
});

// --- History API ---
app.get('/api/history', async (req, res) => {
  try {
    const history = await loadHistory();
    res.json(history.entries.slice().reverse());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/history/:id', async (req, res) => {
  try {
    const history = await loadHistory();
    const entry = history.entries.find(e => e.id === req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    let output = null;
    if (entry.type === 'tool') {
      const logFile = path.join(HISTORY_DIR, `${entry.id}.log`);
      if (await fs.pathExists(logFile)) output = await fs.readFile(logFile, 'utf-8');
    }
    res.json({ ...entry, output });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/history', async (req, res) => {
  try {
    await fs.remove(HISTORY_DIR);
    await fs.writeJson(HISTORY_FILE, { entries: [] });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/history/:id', async (req, res) => {
  try {
    const history = await loadHistory();
    const idx = history.entries.findIndex(e => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Entry not found' });
    const entry = history.entries[idx];
    history.entries.splice(idx, 1);
    await fs.writeJson(HISTORY_FILE, history);
    if (entry.type === 'tool') await fs.remove(path.join(HISTORY_DIR, `${entry.id}.log`)).catch(() => {});
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Test Encode API ---
app.post('/api/test-encode', async (req, res) => {
  if (testEncodeRunning) return res.status(400).json({ error: 'A test encode is already running' });
  if (worker.processing) return res.status(400).json({ error: 'A batch encode is running — wait for it to finish' });

  const { sourceFile, encoder: globalEncoder, crf: globalCrf, preset: globalPreset, tune: globalTune, duration, startTime, screenshotCount, variants } = req.body;
  if (!sourceFile) return res.status(400).json({ error: 'sourceFile is required' });
  if (!variants || variants.length < 1) return res.status(400).json({ error: 'At least 1 variant required' });
  const labels = variants.map(v => v.label.trim());
  if (labels.some(l => !l)) return res.status(400).json({ error: 'All variants need a label' });
  if (new Set(labels).size !== labels.length) return res.status(400).json({ error: 'Variant labels must be unique' });
  if (!(await fs.pathExists(sourceFile))) return res.status(400).json({ error: 'Source file not found' });

  testEncodeRunning = true;
  const basename = path.basename(sourceFile, path.extname(sourceFile));
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15).replace(/(\d{8})(\d{6})/, '$1-$2');
  const defaultOutput = path.join(__dirname, '..', '..', 'output');
  const testDir = path.join(process.env.OUTPUT_DIR || defaultOutput, 'TestEncodes', basename, timestamp);
  await fs.ensureDir(testDir);

  const emit = (data) => {
    io.emit('test_encode_status', data);
    // Mirror to status channel so Dashboard can display test encode progress
    if (data.running) {
      io.emit('status', {
        active: true, status: 'encoding', testEncode: true,
        activeJob: { name: path.basename(sourceFile) },
        progress: data.progress || 0, phase: data.phase,
        phaseLabel: data.phaseLabel,
        variantIndex: data.variantIndex, totalVariants: data.totalVariants,
        variantLabel: data.variantLabel,
        queueLength: queue.length,
        ...(data.fps != null ? { fps: data.fps } : {}),
        ...(data.bitrate != null ? { bitrate: data.bitrate } : {}),
        ...(data.size != null ? { size: data.size } : {}),
        ...(data.estSize != null ? { estSize: data.estSize } : {}),
        ...(data.elapsed != null ? { elapsed: data.elapsed } : {}),
        ...(data.eta != null ? { eta: data.eta } : {}),
        ...(data.currentFrame != null ? { currentFrame: data.currentFrame } : {}),
        ...(data.totalFrames != null ? { totalFrames: data.totalFrames } : {}),
      });
    } else {
      io.emit('status', { active: false, status: 'idle' });
    }
  };
  emit({ running: true, phase: 'sample', phaseLabel: 'Extracting sample', progress: 0, variantIndex: 0, totalVariants: variants.length, testDir });

  res.json({ message: 'Test encode started', testDir });

  // Run the pipeline asynchronously
  (async () => {
    try {
      // Phase 1: Extract sample
      const samplePath = await new Promise((resolve, reject) => {
        const env = {
          ...process.env,
          SOURCE_FILE: sourceFile,
          SAMPLE_DIR: testDir,
          DURATION: String(duration || 60),
        };
        if (startTime) env.START_TIME = String(startTime);
        const child = spawn('bash', [path.join(TOOLS_DIR, 'generate-sample.sh')], { env, detached: true });
        currentTestEncodeChild = child;
        child.stdout.on('data', (d) => emitFormattedLog(d.toString(), 'stdout'));
        child.stderr.on('data', (d) => emitFormattedLog(d.toString(), 'stderr'));
        child.on('close', (code) => {
          currentTestEncodeChild = null;
          if (code !== 0) return reject(new Error(`Sample extraction failed (exit ${code})`));
          // Find the sample file
          const sampleFile = path.join(testDir, `${basename}.sample.mkv`);
          resolve(sampleFile);
        });
      });

      if (!await fs.pathExists(samplePath)) throw new Error('Sample file was not created');
      const sampleProbe = await probeVideo(samplePath);
      const sampleFrames = sampleProbe.totalFrames;

      // Phase 1b: Generate source screenshots
      if (testEncodeRunning) {
        const sourceScreenshotDir = path.join(testDir, 'source', 'Screenshots');
        await fs.ensureDir(sourceScreenshotDir);

        emit({ running: true, phase: 'screenshots', phaseLabel: 'Screenshots: source', progress: 0, variantIndex: 0, totalVariants: variants.length, testDir });

        await new Promise((resolve, reject) => {
          const env = {
            ...process.env,
            INPUT_FILE: samplePath,
            SHOT_DIR: sourceScreenshotDir,
            SHOT_COUNT: String(screenshotCount || 6),
            SHOT_FMT: 'png',
            SHOT_PREFIX: 'source',
          };
          const child = spawn('bash', [path.join(TOOLS_DIR, 'generate-screenshots.sh')], { env, detached: true });
          currentTestEncodeChild = child;
          child.stdout.on('data', (d) => emitFormattedLog(d.toString(), 'stdout'));
          child.stderr.on('data', (d) => emitFormattedLog(d.toString(), 'stderr'));
          child.on('close', (code) => {
            currentTestEncodeChild = null;
            if (code !== 0) return reject(new Error(`Screenshots failed for source (exit ${code})`));
            resolve();
          });
        });
      }

      // Phase 2: Encode variants
      for (let vi = 0; vi < variants.length; vi++) {
        if (!testEncodeRunning) break;
        const variant = variants[vi];
        const variantDir = path.join(testDir, variant.label.trim());
        await fs.ensureDir(variantDir);

        emit({ running: true, phase: 'encoding', phaseLabel: `Encoding variant: ${variant.label}`, progress: 0, variantIndex: vi + 1, totalVariants: variants.length, variantLabel: variant.label, testDir });

        await new Promise((resolve, reject) => {
          const vEncoder = variant.encoder || globalEncoder;
          const vCrf = variant.crf ?? globalCrf ?? 18;
          const vPreset = variant.preset ?? globalPreset ?? 4;
          const vTune = variant.tune ?? globalTune ?? 0;
          if (!vEncoder) { reject(new Error(`No encoder specified for variant "${variant.label}"`)); return; }
          const args = [
            '--input', samplePath,
            '--output-dir', variantDir,
            '--encoder', vEncoder,
            '--crf', String(vCrf),
            '--preset', String(vPreset),
            '--tune', String(vTune),
            '--custom-flags', variant.flags || '',
            '--auto-crop', '0',
            '--deband', variant.deband?.enabled ? '1' : '0',
            ...(variant.deband?.range ? ['--deband-range', String(variant.deband.range)] : []),
            ...(variant.deband?.threshold ? ['--deband-threshold', String(variant.deband.threshold)] : []),
            '--encode-lossless', variant.encode_lossless === false ? '0' : '1',
            '--hdr-to-sdr', variant.hdr_to_sdr ? '1' : '0',
            ...(variant.hdr_to_sdr && variant.tonemap ? ['--tonemap', String(variant.tonemap)] : []),
            ...(variant.downscale ? ['--downscale', String(variant.downscale)] : []),
            '--rename-audio', '0',
            '--overwrite', '1'
          ];
          const child = spawn('bash', [path.join(SCRIPTS_DIR, 'encode_single.sh'), ...args], { detached: true });
          currentTestEncodeChild = child;
          let cropInfo = null;
          const onData = (d, type) => {
            const raw = d.toString();
            const clean = stripAnsi(raw);
            emitFormattedLog(raw, type);
            const result = parseEncodeOutput(clean, sampleFrames, cropInfo);
            if (result.cropInfo) cropInfo = result.cropInfo;
            if (result.progress >= 0) {
              emit({ running: true, phase: 'encoding', phaseLabel: `Encoding variant: ${variant.label}`, progress: result.progress, variantIndex: vi + 1, totalVariants: variants.length, variantLabel: variant.label, testDir, ...result.stats });
            }
          };
          child.stdout.on('data', (d) => onData(d, 'stdout'));
          child.stderr.on('data', (d) => onData(d, 'stderr'));
          child.on('close', (code) => {
            currentTestEncodeChild = null;
            if (code !== 0) return reject(new Error(`Encode failed for variant "${variant.label}" (exit ${code})`));
            resolve();
          });
        });
      }

      // Phase 3: Generate screenshots
      for (let vi = 0; vi < variants.length; vi++) {
        if (!testEncodeRunning) break;
        const variant = variants[vi];
        const variantDir = path.join(testDir, variant.label.trim());
        const screenshotDir = path.join(variantDir, 'Screenshots');

        emit({ running: true, phase: 'screenshots', phaseLabel: `Screenshots: ${variant.label}`, progress: ((vi) / variants.length) * 100, variantIndex: vi + 1, totalVariants: variants.length, variantLabel: variant.label, testDir });

        await new Promise((resolve, reject) => {
          const env = {
            ...process.env,
            OUTPUT_DIR: variantDir,
            SHOT_DIR: screenshotDir,
            SHOT_COUNT: String(screenshotCount || 6),
            SHOT_FMT: 'png',
            SHOT_PREFIX: variant.label.trim(),
            SOURCE_DURATION: String(sampleProbe.duration),
          };
          const child = spawn('bash', [path.join(TOOLS_DIR, 'generate-screenshots.sh')], { env, detached: true });
          currentTestEncodeChild = child;
          child.stdout.on('data', (d) => emitFormattedLog(d.toString(), 'stdout'));
          child.stderr.on('data', (d) => emitFormattedLog(d.toString(), 'stderr'));
          child.on('close', (code) => {
            currentTestEncodeChild = null;
            if (code !== 0) return reject(new Error(`Screenshots failed for variant "${variant.label}" (exit ${code})`));
            resolve();
          });
        });
      }

      emit({ running: false, phase: 'done', phaseLabel: 'Test encode complete', progress: 100, testDir });
      emitFormattedLog(`Test encode complete. Output: ${testDir}`, 'info');
    } catch (err) {
      emitFormattedLog(`Test encode error: ${err.message}`, 'error');
      emit({ running: false, phase: 'error', phaseLabel: `Error: ${err.message}`, progress: 0, testDir });
    } finally {
      testEncodeRunning = false;
      currentTestEncodeChild = null;
    }
  })();
});

app.post('/api/test-encode/stop', (req, res) => {
  if (!testEncodeRunning) return res.json({ success: false, message: 'No test encode running' });
  testEncodeRunning = false;
  if (currentTestEncodeChild) {
    try { process.kill(-currentTestEncodeChild.pid, 'SIGTERM'); } catch (e) { try { currentTestEncodeChild.kill('SIGTERM'); } catch (e2) {} }
    currentTestEncodeChild = null;
  }
  io.emit('test_encode_status', { running: false, phase: 'stopped', phaseLabel: 'Test encode stopped' });
  res.json({ success: true });
});

// --- Compare / Test Encode browsing endpoints ---

app.get('/api/test-encodes', async (req, res) => {
  try {
    const defaultOutput = path.join(__dirname, '..', '..', 'output');
    const testEncodesRoot = path.join(process.env.OUTPUT_DIR || defaultOutput, 'TestEncodes');
    if (!await fs.pathExists(testEncodesRoot)) return res.json([]);

    const basenames = (await fs.readdir(testEncodesRoot, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name);
    const result = [];

    for (const basename of basenames) {
      const basenameDir = path.join(testEncodesRoot, basename);
      const timestamps = (await fs.readdir(basenameDir, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort().reverse();
      const sessions = [];

      for (const ts of timestamps) {
        const sessionPath = path.join(basenameDir, ts);
        const entries = (await fs.readdir(sessionPath, { withFileTypes: true })).filter(d => d.isDirectory());
        const variants = [];
        for (const entry of entries) {
          const ssDir = path.join(sessionPath, entry.name, 'Screenshots');
          let screenshotCount = 0;
          if (await fs.pathExists(ssDir)) {
            screenshotCount = (await fs.readdir(ssDir)).filter(f => /\.(png|jpg|jpeg)$/i.test(f)).length;
          }
          variants.push({ label: entry.name, screenshotCount });
        }
        if (variants.length > 0) {
          sessions.push({ timestamp: ts, path: sessionPath, variants });
        }
      }

      if (sessions.length > 0) {
        result.push({ basename, sessions });
      }
    }

    res.json(result);
  } catch (err) {
    console.error('Error listing test encodes:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/test-encodes/screenshots', async (req, res) => {
  try {
    const sessionPath = req.query.session;
    if (!sessionPath) return res.status(400).json({ error: 'session query param required' });

    const defaultOutput = path.join(__dirname, '..', '..', 'output');
    const testEncodesRoot = path.join(process.env.OUTPUT_DIR || defaultOutput, 'TestEncodes');
    const resolved = path.resolve(sessionPath);
    if (!resolved.startsWith(path.resolve(testEncodesRoot))) return res.status(403).json({ error: 'Path outside TestEncodes directory' });

    if (!await fs.pathExists(resolved)) return res.status(404).json({ error: 'Session not found' });

    const entries = (await fs.readdir(resolved, { withFileTypes: true })).filter(d => d.isDirectory());
    const variants = [];

    for (const entry of entries) {
      const ssDir = path.join(resolved, entry.name, 'Screenshots');
      let files = [];
      if (await fs.pathExists(ssDir)) {
        files = (await fs.readdir(ssDir)).filter(f => /\.(png|jpg|jpeg)$/i.test(f)).sort();
      }
      variants.push({ label: entry.name, screenshots: files });
    }

    res.json({ session: resolved, variants });
  } catch (err) {
    console.error('Error listing screenshots:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/test-encodes/image', async (req, res) => {
  try {
    const { session, variant, file } = req.query;
    if (!session || !variant || !file) return res.status(400).json({ error: 'session, variant, and file query params required' });

    const defaultOutput = path.join(__dirname, '..', '..', 'output');
    const testEncodesRoot = path.join(process.env.OUTPUT_DIR || defaultOutput, 'TestEncodes');

    // Path traversal protection
    if (variant.includes('..') || variant.includes('/') || variant.includes('\\')) return res.status(400).json({ error: 'Invalid variant' });
    if (file.includes('..') || file.includes('/') || file.includes('\\')) return res.status(400).json({ error: 'Invalid file' });

    const filePath = path.resolve(path.join(session, variant, 'Screenshots', file));
    if (!filePath.startsWith(path.resolve(testEncodesRoot))) return res.status(403).json({ error: 'Path outside TestEncodes directory' });

    if (!await fs.pathExists(filePath)) return res.status(404).json({ error: 'Image not found' });

    res.sendFile(filePath);
  } catch (err) {
    console.error('Error serving image:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/test-encodes/session', async (req, res) => {
  try {
    const sessionPath = req.query.session;
    if (!sessionPath) return res.status(400).json({ error: 'session query param required' });
    const defaultOutput = path.join(__dirname, '..', '..', 'output');
    const testEncodesRoot = path.resolve(path.join(process.env.OUTPUT_DIR || defaultOutput, 'TestEncodes'));
    const resolved = path.resolve(sessionPath);
    if (!resolved.startsWith(testEncodesRoot)) return res.status(403).json({ error: 'Path outside TestEncodes directory' });
    if (!await fs.pathExists(resolved)) return res.status(404).json({ error: 'Session not found' });
    await fs.remove(resolved);
    // Clean up empty parent basename dir
    const parent = path.dirname(resolved);
    if (await fs.pathExists(parent)) {
      const remaining = await fs.readdir(parent);
      if (remaining.length === 0) await fs.remove(parent);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting session:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/test-encodes/all', async (req, res) => {
  try {
    const defaultOutput = path.join(__dirname, '..', '..', 'output');
    const testEncodesRoot = path.join(process.env.OUTPUT_DIR || defaultOutput, 'TestEncodes');
    if (await fs.pathExists(testEncodesRoot)) await fs.remove(testEncodesRoot);
    res.json({ success: true });
  } catch (err) {
    console.error('Error clearing test encodes:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/cleanup/work-dirs', async (req, res) => {
  try {
    const defaultOutput = path.join(__dirname, '..', '..', 'output');
    const outputRoot = process.env.OUTPUT_DIR || defaultOutput;
    let removed = 0;

    const cleanDir = async (dir) => {
      if (!await fs.pathExists(dir)) return;
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('.work-')) {
          await fs.remove(path.join(dir, entry.name));
          removed++;
        } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await cleanDir(path.join(dir, entry.name));
        }
      }
    };

    await cleanDir(outputRoot);
    emitFormattedLog(`Cleaned up ${removed} leftover work director${removed === 1 ? 'y' : 'ies'}`, 'info');
    res.json({ success: true, removed });
  } catch (err) {
    console.error('Error cleaning work dirs:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/version', (req, res) => res.json({ version: '0.2.0-nightly.20260503', channel: 'nightly' }));

if (fs.existsSync(frontendDist)) app.get('*', (req, res) => { if (!req.path.startsWith('/api')) res.sendFile(path.join(frontendDist, 'index.html')); });

loadQueue().then(() => {
  server.listen(PORT, () => { console.log(`[PRISM] System online — port ${PORT}`); if (queue.length > 0) console.log(`[PRISM] Queue loaded — ${queue.length} job(s) standing by`); });
});
