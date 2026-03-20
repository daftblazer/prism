const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');
const os = require('os');

console.log("####################################");
console.log(">>> PRISM SERVER V0.1.0 STARTING <<<");
console.log("####################################");

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

let queue = [];
let currentJob = null;
let currentChild = null;
let isBuilding = false;
let paused = false;
let currentToolChild = null;
let toolRunning = false;
let testEncodeRunning = false;
let currentTestEncodeChild = null;

async function loadSettings() {
  try {
    if (await fs.pathExists(SETTINGS_FILE)) return await fs.readJson(SETTINGS_FILE);
  } catch (err) { console.error('Settings load error:', err); }
  return {};
}

async function saveSettings(settings) {
  try { await fs.ensureDir(CONFIG_DIR); await fs.writeJson(SETTINGS_FILE, settings); } catch (err) { console.error('Settings save error:', err); }
}

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

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

class Worker {
  constructor() { this.processing = false; this.stopping = false; }
  async start() { if (this.processing) return; this.stopping = false; this.processing = true; this.processNext(); }
  stop() { 
    this.stopping = true; 
    if (currentChild) { 
      try { process.kill(-currentChild.pid, 'SIGTERM'); } catch(e) { try { currentChild.kill('SIGTERM'); } catch(e2) {} } 
      currentChild = null; 
    } 
  }
  
  async processNext() {
    if (queue.length === 0 || this.stopping) { 
      this.processing = false; this.stopping = false; currentJob = null; io.emit('status', { active: false, status: 'idle' }); return; 
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
      queue.shift();
      await saveQueue();
      io.emit('queue_update', queue);
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
    const { input_folder, encoder, crf, preset, tune, custom_flags, subfolder } = batch;
    if (!(await fs.pathExists(input_folder))) { this.log(`Path missing: ${input_folder}`, 'error'); return; }
    const stats = await fs.stat(input_folder);
    let files = [];
    if (stats.isDirectory()) {
      files = await this.getFilesRecursive(input_folder);
      files = files.filter(f => ['.mkv', '.mp4', '.avi', '.ts', '.mov', '.webm'].includes(path.extname(f).toLowerCase()));
      files.sort();
    } else {
      files = [input_folder];
    }

    for (let i = 0; i < files.length; i++) {
      if (this.stopping) return;
      const file = files[i];
      const progressBase = (i / files.length) * 100;
      const progressStep = 100 / files.length;
      io.emit('status', {
        active: true, status: 'encoding', activeJob: { name: path.basename(file) },
        progress: progressBase, currentFile: path.basename(file), currentFilePath: file,
        fileIndex: i + 1, totalFiles: files.length, queueLength: queue.length,
        encoder: batch.encoder
      });
      await this.encodeFile(file, batch, (fProg, encStats) => {
        io.emit('status', {
          active: true, status: 'encoding', activeJob: { name: path.basename(file) },
          progress: progressBase + (fProg * progressStep / 100),
          currentFile: path.basename(file), currentFilePath: file, fileIndex: i + 1, totalFiles: files.length,
          queueLength: queue.length, encoder: batch.encoder, ...encStats
        });
      });
    }
    if (!this.stopping) io.emit('status', { active: false, status: 'idle', progress: 100 });
  }

  async encodeFile(file, batch, onProgress) {
    const probeInfo = await probeVideo(file);
    const totalFrames = probeInfo.totalFrames;
    if (totalFrames > 0) this.log(`Probed total frames for ${path.basename(file)}: ${totalFrames}`, 'info');
    else this.log(`Could not determine total frames for ${path.basename(file)} - progress may be unavailable`, 'info');
    
    return new Promise((resolve) => {
      const { input_folder, encoder, crf, preset, tune, custom_flags, subfolder, auto_crop, crop, rename_audio } = batch;
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
      
      const args = [
        '--input', file, 
        '--output-dir', outputDir, 
        '--encoder', encoder, 
        '--crf', crf, 
        '--preset', preset, 
        '--tune', tune, 
        '--custom-flags', custom_flags || "", 
        '--auto-crop', auto_crop ? '1' : '0', 
        '--rename-audio', rename_audio ? '1' : '0'
      ];
      
      if (crop) args.push('--crop', crop);
      
      const child = spawn('bash', [path.join(SCRIPTS_DIR, 'encode_single.sh'), ...args], { detached: true });
      currentChild = child;
      
      let cropInfo = null;
      let fileMeta = {
        resolution: probeInfo.width && probeInfo.height ? `${probeInfo.width}x${probeInfo.height}` : null,
        sourceCodec: probeInfo.codec || null,
        duration: probeInfo.duration || null,
      };
      const parseOutput = (out) => {
        const result = parseEncodeOutput(stripAnsi(out), totalFrames, cropInfo);
        if (result.cropInfo) { cropInfo = result.cropInfo; }
        // Accumulate metadata across chunks
        if (result.meta.color) fileMeta.color = result.meta.color;
        if (result.meta.sourceFps) fileMeta.sourceFps = result.meta.sourceFps;
        if (result.meta.audioTracks) fileMeta.audioTracks = result.meta.audioTracks;
        if (result.progress >= 0) { onProgress(result.progress, { ...result.stats, fileMeta }); return; }
        if (result.muxProgress >= 0) { onProgress(result.muxProgress, { phase: 'muxing', fileMeta }); }
      };
      
      child.stdout.on('data', (d) => { const out = d.toString(); this.log(out, 'stdout'); parseOutput(out); });
      child.stderr.on('data', (d) => { const out = d.toString(); this.log(out, 'stderr'); parseOutput(out); });
      
      child.on('close', (code) => { 
        currentChild = null; 
        if (code !== 0) this.log(`Encode of ${path.basename(file)} failed with code ${code}`, 'error');
        else this.log(`Encode of ${path.basename(file)} finished successfully`, 'info');
        resolve(); 
      });
    });
  }

  log(msg, type = 'info') {
    const clean = stripAnsi(msg);
    const entry = `[${new Date().toISOString()}] [${type.toUpperCase()}] ${clean}`;
    console.log(entry); io.emit('logs', entry);
  }
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
    const ignoreAtRoot = ['proc', 'sys', 'dev', 'run', 'boot', 'etc', 'var', 'lib', 'lib64', 'bin', 'sbin', 'usr', 'opt', 'root', 'srv', 'tmp'];
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
app.get('/api/status', (req, res) => {
  const s = isBuilding ? 'building' : (worker.processing ? 'encoding' : (paused ? 'paused' : 'idle'));
  res.json({ active: isBuilding || worker.processing, status: s, activeJob: isBuilding ? { name: 'Building' } : (currentJob ? { name: currentJob.input_folder } : null), queueLength: queue.length });
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

// --- Tools API ---
app.get('/api/tools', async (req, res) => {
  try { const registry = await fs.readJson(TOOL_REGISTRY_FILE); res.json(registry); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/tools/probe', async (req, res) => {
  const dirPath = req.query.path;
  if (!dirPath) return res.status(400).json({ error: 'path required' });
  try {
    const files = await fs.readdir(dirPath);
    const mkv = files.find(f => f.toLowerCase().endsWith('.mkv'));
    if (!mkv) return res.status(404).json({ error: 'No MKV found in directory' });
    const filePath = path.join(dirPath, mkv);
    const probe = spawn('mkvmerge', ['-J', filePath]);
    let out = '';
    probe.stdout.on('data', (d) => out += d.toString());
    probe.on('close', (code) => {
      if (code !== 0) return res.status(500).json({ error: 'mkvmerge probe failed' });
      try { res.json(JSON.parse(out)); } catch { res.status(500).json({ error: 'Failed to parse probe output' }); }
    });
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
  io.emit('tool_status', { running: true, toolId: tool.id, toolName: tool.name });

  // Use the first absolute path the user provided as cwd, so relative defaults (e.g. "Output") resolve sensibly
  const toolCwd = [envVars.INPUT_DIR, envVars.TARGET_DIR, envVars.OUT_DIR, envVars.OUTPUT_DIR].find(p => p && path.isAbsolute(p)) || ROOT_DIR;
  const child = spawn('bash', [scriptPath], { env: envVars, cwd: toolCwd });
  currentToolChild = child;

  child.stdout.on('data', (d) => { const clean = stripAnsi(d.toString()); io.emit('tool_output', clean); });
  child.stderr.on('data', (d) => { const clean = stripAnsi(d.toString()); io.emit('tool_output', clean); });
  child.on('close', (code) => {
    currentToolChild = null;
    toolRunning = false;
    io.emit('tool_output', `\n[Process exited with code ${code}]\n`);
    io.emit('tool_status', { running: false, toolId: tool.id, toolName: tool.name, exitCode: code });
  });

  res.json({ message: 'Tool started', toolId: tool.id });
});

app.post('/api/tools/:id/stop', (req, res) => {
  if (!currentToolChild) return res.json({ success: false, message: 'No tool running' });
  try { currentToolChild.kill('SIGTERM'); } catch (e) { console.error('Kill error:', e); }
  res.json({ success: true });
});

// --- Test Encode API ---
app.post('/api/test-encode', async (req, res) => {
  if (testEncodeRunning) return res.status(400).json({ error: 'A test encode is already running' });
  if (worker.processing) return res.status(400).json({ error: 'A batch encode is running — wait for it to finish' });

  const { sourceFile, encoder, crf, preset, tune, duration, startTime, screenshotCount, variants } = req.body;
  if (!sourceFile || !encoder) return res.status(400).json({ error: 'sourceFile and encoder are required' });
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

  const emit = (data) => io.emit('test_encode_status', data);
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
        child.stdout.on('data', (d) => { const clean = stripAnsi(d.toString()); io.emit('logs', `[TEST] ${clean}`); });
        child.stderr.on('data', (d) => { const clean = stripAnsi(d.toString()); io.emit('logs', `[TEST] ${clean}`); });
        child.on('close', (code) => {
          currentTestEncodeChild = null;
          if (code !== 0) return reject(new Error(`Sample extraction failed (exit ${code})`));
          // Find the sample file
          const sampleFile = path.join(testDir, `${basename}.sample.mkv`);
          resolve(sampleFile);
        });
      });

      if (!await fs.pathExists(samplePath)) throw new Error('Sample file was not created');
      const sampleFrames = await probeVideo(samplePath);

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
          child.stdout.on('data', (d) => { io.emit('logs', `[TEST:screenshots:source] ${stripAnsi(d.toString())}`); });
          child.stderr.on('data', (d) => { io.emit('logs', `[TEST:screenshots:source] ${stripAnsi(d.toString())}`); });
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
          const args = [
            '--input', samplePath,
            '--output-dir', variantDir,
            '--encoder', encoder,
            '--crf', String(crf || 18),
            '--preset', String(preset || 4),
            '--tune', String(tune || 0),
            '--custom-flags', variant.flags || '',
            '--auto-crop', '0',
            '--rename-audio', '0',
            '--overwrite', '1'
          ];
          const child = spawn('bash', [path.join(SCRIPTS_DIR, 'encode_single.sh'), ...args], { detached: true });
          currentTestEncodeChild = child;
          let cropInfo = null;
          const onData = (d) => {
            const clean = stripAnsi(d.toString());
            io.emit('logs', `[TEST:${variant.label}] ${clean}`);
            const result = parseEncodeOutput(clean, sampleFrames, cropInfo);
            if (result.cropInfo) cropInfo = result.cropInfo;
            if (result.progress >= 0) {
              emit({ running: true, phase: 'encoding', phaseLabel: `Encoding variant: ${variant.label}`, progress: result.progress, variantIndex: vi + 1, totalVariants: variants.length, variantLabel: variant.label, testDir, ...result.stats });
            }
          };
          child.stdout.on('data', onData);
          child.stderr.on('data', onData);
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
          };
          const child = spawn('bash', [path.join(TOOLS_DIR, 'generate-screenshots.sh')], { env, detached: true });
          currentTestEncodeChild = child;
          child.stdout.on('data', (d) => { io.emit('logs', `[TEST:screenshots:${variant.label}] ${stripAnsi(d.toString())}`); });
          child.stderr.on('data', (d) => { io.emit('logs', `[TEST:screenshots:${variant.label}] ${stripAnsi(d.toString())}`); });
          child.on('close', (code) => {
            currentTestEncodeChild = null;
            if (code !== 0) return reject(new Error(`Screenshots failed for variant "${variant.label}" (exit ${code})`));
            resolve();
          });
        });
      }

      emit({ running: false, phase: 'done', phaseLabel: 'Test encode complete', progress: 100, testDir });
      io.emit('logs', `[TEST] Complete. Output: ${testDir}`);
    } catch (err) {
      io.emit('logs', `[TEST] Error: ${err.message}`);
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

app.get('/api/version', (req, res) => res.json({ version: '0.1.0', channel: 'release' }));

if (fs.existsSync(frontendDist)) app.get('*', (req, res) => { if (!req.path.startsWith('/api')) res.sendFile(path.join(frontendDist, 'index.html')); });

loadQueue().then(() => {
  server.listen(PORT, () => { console.log(`Server on ${PORT}`); if (queue.length > 0) console.log(`Queue has ${queue.length} job(s) — waiting for manual resume`); });
});
