# PRISM

**Processing, Rendering, and Interface System for Media**

A batch AV1 video encoding system with a NERV-inspired web dashboard for managing encode jobs, building custom SVT-AV1 encoder forks, running media tools, comparing test encodes, and monitoring everything in real time.

## Features

- **Batch encoding** — Queue entire folders of video files for AV1 encoding with real-time telemetry
- **Parallel encoding** — Run multiple encode instances simultaneously with CCD-aware CPU pinning via `taskset`, configurable reserved cores, and per-instance `--lp` thread control
- **Multiple encoder support** — Build and switch between SVT-AV1 forks (5fish PSY, HDR, Essential) from source, with branch selection
- **Smart audio handling** — Lossless audio is transcoded to Opus; lossy formats are copied as-is with language tags and titles preserved
- **Auto-crop detection** — Automatically detects and removes black bars
- **Real-time dashboard** — Live encoding statistics (frames, speed, bitrate, size, ETA), system metrics (per-core CPU, memory), NERV-styled terminal output, media intelligence panel, and operation queue
- **Test encode & compare** — Run short sample encodes with different settings and compare screenshots side-by-side
- **Media tools** — 20+ built-in shell tools for muxing, renaming tracks, analyzing color, generating screenshots, and more — all runnable from the UI
- **System monitoring** — Per-core CPU usage with color-coded bars, segmented memory visualization, load averages, and uptime
- **Pause/resume** — Pause and resume encode jobs without losing progress
- **Persistent queue** — Jobs survive server restarts
- **Dockerized** — Runs self-contained on Unraid or any Docker host

## Quick Start (Docker)

```bash
docker build --no-cache -t prism .

docker run -d \
  --name prism \
  --restart unless-stopped \
  -p 3000:3000 \
  -v /path/to/input:/input \
  -v /path/to/output:/output \
  -v /path/to/config:/config \
  prism
```

Or with docker-compose (edit volume paths in `docker-compose.yml` first):

```bash
docker compose up -d
```

Then open `http://<host>:3000`.

## Web UI

### Dashboard

The main operations view with a 3x2 grid layout:

- **Encode panel** — Current file name, progress bar, pause/resume/stop controls. Multi-instance mode shows per-instance cards with individual progress and FPS
- **Encoding statistics** — Live frames, speed, bitrate, size, elapsed, remaining, and crop data organized into Operation, Performance, and Timing sections
- **System metrics** — Per-core CPU bars (green/orange/red based on load), segmented memory bar, load averages, and uptime
- **Terminal log** — NERV-styled telemetry feed with color-coded output (green for encode data, cyan for initialization, red for errors) and auto-scroll
- **Media intelligence** — Source file metadata including resolution, codec, frame rate, color space (primaries, transfer, matrix, range), and audio track details
- **Operation queue** — Current and upcoming jobs

### Queue

View and manage pending batch jobs. Add new batches with the file browser, configure encoder, CRF, preset, tune, custom flags, output subfolder, auto-crop, and audio renaming options. Supports directory favorites.

### Encoders

View installed encoders, select a git branch, and compile from source. Build logs stream in real time.

### Tools

Run 20+ media tools directly from the UI with a file browser. Tools include:

| Category | Tools |
|----------|-------|
| **Muxing** | mux-english, mux-commentary, strip-compat-audio |
| **Renaming** | rename-tracks, rename-files, rename-subtitles, rename-chapters |
| **Audio** | keep-japanese-audio, set-default-audio, swap-audio-order, shift-audio-offset |
| **Subtitles** | set-default-subtitle, swap-subtitle-order, shift-subtitle-offset |
| **Analysis** | analyze-color, analyze-vfr, compare-runtimes |
| **Generation** | generate-sample, generate-screenshots, generate-release-md |

### Compare

Run test encodes with different CRF/preset/tune combinations on a sample, then compare screenshots frame-by-frame with a side-by-side viewer.

### Settings

Toggle CRT effects and light mode. Configure release group name for output tagging.

**Encoding settings:**

| Setting | Default | Description |
|---------|---------|-------------|
| Parallel Instances | 1 | Number of simultaneous encode processes (1-8) |
| Reserved Cores | 0 | Cores reserved for host OS, starting from core 0. Each reserved core removes both its physical thread and hyperthread |
| Threads per CCD | 0 | Enables CCD-aware thread allocation for AMD CPUs (e.g. 16 for an 8-core CCD with SMT). Set to 0 to use simple contiguous splitting |

A live thread allocation preview shows the computed CPU assignments for each instance. When `taskset` is available, each encode process is pinned to its assigned cores and given a matching `--lp` thread count.

## Supported Encoders

Encoders are compiled from source inside the container via build scripts:

| Encoder | Fork | Default Branch | Description |
|---------|------|----------------|-------------|
| **5fish** | [svt-av1-psy](https://github.com/5fish/svt-av1-psy) | `exp` | Psycho-visual tuned SVT-AV1 |
| **HDR** | [svt-av1-hdr](https://github.com/juliobbv-p/svt-av1-hdr) | `main` | SVT-AV1 fork optimized for live-action and HDR content |
| **Essential** | [SVT-AV1-Essential](https://github.com/nekotrix/SVT-AV1-Essential) | `Essential-v4.0.1` | Essential SVT-AV1 fork |

Encoders are built and stored in `/config/encoders/<name>/` and can be compiled or rebuilt from the **Encoders** tab.

## Encoding Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| CRF | 18 | Quality level (lower = higher quality) |
| Preset | 4 | Speed/quality tradeoff (0-13, lower = slower/better) |
| Tune | 0 | Tuning mode (0-4) |
| Custom Flags | — | Extra encoder flags (e.g. `--lineart-psy-bias 3`) |
| Output Subfolder | — | Optional subdirectory under `/output` |
| Auto-Crop | off | Detect and remove black bars automatically |
| Parallel Instances | 1 | Run N files simultaneously with CPU pinning |

## Audio Processing

Audio tracks are handled automatically per-track:

- **Lossless** (FLAC, TrueHD, DTS-HD MA, ALAC, PCM, etc.) → Opus with adaptive bitrate
- **Lossy** (AC3, EAC3, AAC, MP3, DTS, Opus, Vorbis) → Copied without re-encoding
- Bitrate is chosen by channel count: stereo 128k, 5.1 256k, 7.1 320k
- Language tags and track titles are preserved

## Tech Stack

- **Backend**: Node.js, Express, Socket.IO
- **Frontend**: React 18, Vite, Tailwind CSS, Lucide icons
- **Encoding**: FFmpeg, SVT-AV1 (via encoder forks), mkvmerge
- **Container**: Debian Trixie
