# PRISM

A batch AV1 video encoding system with a web UI for managing encode jobs, building custom SVT-AV1 encoder forks, and monitoring progress in real time.

## Features

- **Batch encoding** - Queue up entire folders of video files for AV1 encoding
- **Multiple encoder support** - Build and switch between SVT-AV1 forks (5fish PSY, Tritium)
- **Smart audio handling** - Lossless audio (FLAC, TrueHD, DTS-HD MA, PCM) is transcoded to Opus; lossy formats are copied as-is
- **Auto-crop detection** - Automatically detects and removes black bars
- **Real-time dashboard** - Live progress, fps, bitrate, file size, ETA, and terminal output
- **Theming** - Dark/light mode with 7 accent colors, persisted in the browser
- **Dockerized** - Runs self-contained on Unraid or any Docker host

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

## Unraid

Adjust the volume paths to your shares:

```bash
docker run -d \
  --name prism \
  --restart unless-stopped \
  -p 3000:3000 \
  -v /mnt/user/media/input:/input \
  -v /mnt/user/media/output:/output \
  -v /mnt/user/appdata/prism:/config \
  prism
```

### Rebuilding after changes

```bash
docker stop prism
docker rm prism
docker rmi prism
docker build --no-cache -t prism .
# then run again with the command above
```

## Supported Encoders

Encoders are compiled from source inside the container (or on the host) via the build scripts:

| Encoder | Fork | Default Branch | Description |
|---------|------|----------------|-------------|
| **5fish** | [svt-av1-psy](https://github.com/5fish/svt-av1-psy) | `exp` | Psycho-visual tuned SVT-AV1 |
| **Tritium** | [svt-av1-tritium](https://github.com/Uranite/svt-av1-tritium) | `main` | Tritium SVT-AV1 fork |

Encoders are built and stored in `/config/encoders/<name>/` and can be compiled or rebuilt directly from the web UI's **Encoders** tab.

## Encoding Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| CRF | 18 | Quality level (lower = higher quality) |
| Preset | 4 | Speed/quality tradeoff (0-13, lower = slower/better) |
| Tune | 0 | Tuning mode (0-4) |
| Custom Flags | — | Extra encoder flags (e.g. `--lineart-psy-bias 3`) |
| Output Subfolder | — | Optional subdirectory under `/output` |

## Audio Processing

Audio tracks are handled automatically per-track:

- **Lossless** (FLAC, TrueHD, DTS-HD MA, ALAC, PCM, etc.) → Opus with adaptive bitrate
- **Lossy** (AC3, EAC3, AAC, MP3, DTS, Opus, Vorbis) → Copied without re-encoding
- Bitrate is chosen by channel count: stereo 128k, 5.1 256k, 7.1 320k
- Language tags and track titles are preserved

## Web UI

### Dashboard
Real-time encoding status with progress bar, frame count, speed (fps), bitrate, current/estimated file size, elapsed time, and ETA. Includes a terminal log viewer with scroll lock and a stop button.

### Queue
View and manage pending batch jobs. Jobs are persisted to disk and survive container restarts.

### Encoders
View installed encoders, select a git branch, and compile from source. Build logs stream in real time.

### Settings
Toggle dark/light mode and choose an accent color (red, blue, purple, pink, cyan, orange, green). Preferences are saved in the browser.

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | Current encoding status |
| GET | `/api/queue` | List queued batches |
| POST | `/api/queue` | Add a batch to the queue |
| DELETE | `/api/queue/:id` | Remove a batch from the queue |
| GET | `/api/encoders` | List available encoders |
| POST | `/api/encoders/:name/build` | Build/rebuild an encoder |
| GET | `/api/browse?path=` | Browse directories (for file picker) |
| POST | `/api/stop` | Stop the current encode |

WebSocket events are emitted via Socket.IO for `status`, `logs`, `build_logs`, `queue_update`, and `build_complete`.

## Project Structure

```
├── Dockerfile
├── docker-compose.yml
├── build_5fish.sh          # Compiler script for 5fish encoder
├── build_tritium.sh        # Compiler script for Tritium encoder
├── scripts/
│   └── encode_single.sh    # Single-file encoding pipeline
└── webui/
    ├── server/
    │   └── index.js         # Express + Socket.IO backend
    └── client/
        └── src/
            ├── App.jsx      # React UI
            ├── main.jsx
            └── index.css
```

## Tech Stack

- **Backend**: Node.js, Express, Socket.IO
- **Frontend**: React 18, Vite, Tailwind CSS, Lucide icons
- **Encoding**: FFmpeg, SVT-AV1 (via encoder forks), mkvmerge
- **Container**: Debian Trixie
