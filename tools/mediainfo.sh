#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Display MediaInfo-style metadata for video files.
# Uses mediainfo if available, otherwise builds equivalent output from ffprobe.

have() { command -v "$1" >/dev/null 2>&1; }

SOURCE_FILE="${SOURCE_FILE:-}"
INPUT_DIR="${INPUT_DIR:-}"

files=()
if [[ -n "$SOURCE_FILE" && -f "$SOURCE_FILE" ]]; then
  files=("$SOURCE_FILE")
elif [[ -n "$INPUT_DIR" && -d "$INPUT_DIR" ]]; then
  shopt -s nullglob
  for f in "$INPUT_DIR"/*.{mkv,mp4,mov,avi,webm}; do
    files+=("$f")
  done
fi

if [[ ${#files[@]} -eq 0 ]]; then
  echo "No video files found."
  exit 1
fi

for file in "${files[@]}"; do
  echo "════════════════════════════════════════════════════════════════"
  echo "  $(basename "$file")"
  echo "════════════════════════════════════════════════════════════════"

  if have mediainfo; then
    mediainfo "$file"
  elif have ffprobe; then
    python3 - "$file" <<'PY'
import sys, re, subprocess
from collections import defaultdict

result = subprocess.run(
    ['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'flat', sys.argv[1]],
    capture_output=True, text=True
)
lines = result.stdout.strip().split('\n')
fmt = {}
streams = defaultdict(dict)

for line in lines:
    m = re.match(r'(format|streams\.stream\.(\d+))\.(.+?)=("?)(.+?)\4$', line)
    if not m:
        continue
    if m.group(1) == 'format':
        fmt[m.group(3)] = m.group(5)
    else:
        idx = int(m.group(2))
        streams[idx][m.group(3)] = m.group(5)

def fmt_dur(secs):
    try:
        s = float(secs)
    except (ValueError, TypeError):
        return secs
    h, rem = divmod(int(s), 3600)
    m, sec = divmod(rem, 60)
    if h > 0:
        return f"{h}h {m:02d}m {sec:02d}s"
    return f"{m}m {sec:02d}s"

def fmt_bitrate(bps):
    try:
        b = float(bps)
    except (ValueError, TypeError):
        return bps
    if b >= 1_000_000:
        return f"{b/1_000_000:.1f} Mb/s"
    return f"{b/1_000:.0f} kb/s"

def fmt_size(b):
    try:
        n = float(b)
    except (ValueError, TypeError):
        return b
    for unit in ['B', 'KB', 'MB', 'GB']:
        if n < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"

# General
print("\nGeneral")
if fmt.get('format_long_name'):
    print(f"  Format                         : {fmt['format_long_name']}")
if fmt.get('duration'):
    print(f"  Duration                       : {fmt_dur(fmt['duration'])}")
if fmt.get('bit_rate'):
    print(f"  Overall bit rate               : {fmt_bitrate(fmt['bit_rate'])}")
if fmt.get('size'):
    print(f"  File size                      : {fmt_size(fmt['size'])}")
tags = {k.replace('tags.', ''): v for k, v in fmt.items() if k.startswith('tags.')}
if tags.get('title'):
    print(f"  Title                          : {tags['title']}")
if tags.get('ENCODER') or tags.get('encoder'):
    print(f"  Writing application            : {tags.get('ENCODER', tags.get('encoder', ''))}")

for idx in sorted(streams):
    s = streams[idx]
    codec_type = s.get('codec_type', 'unknown')

    if codec_type == 'video':
        print(f"\nVideo (Track {idx})")
        print(f"  Format                         : {s.get('codec_long_name', s.get('codec_name', 'unknown'))}")
        if s.get('profile'):
            print(f"  Format profile                 : {s['profile']}")
        w, h = s.get('width', '?'), s.get('height', '?')
        print(f"  Width                          : {w} pixels")
        print(f"  Height                         : {h} pixels")
        try:
            ratio = int(w) / int(h)
            common = {1.778: '16:9', 1.333: '4:3', 2.333: '21:9', 2.389: '43:18', 1.0: '1:1'}
            r = min(common, key=lambda x: abs(x - ratio))
            if abs(r - ratio) < 0.05:
                print(f"  Display aspect ratio           : {common[r]}")
        except (ValueError, ZeroDivisionError):
            pass
        if s.get('r_frame_rate'):
            fr = s['r_frame_rate']
            try:
                num, den = fr.split('/')
                fps = int(num) / int(den)
                print(f"  Frame rate                     : {fps:.3f} ({fr}) FPS")
            except:
                print(f"  Frame rate                     : {fr}")
        if s.get('pix_fmt'):
            pix = s['pix_fmt']
            depth = '10' if '10' in pix or 'p010' in pix else '8'
            chroma = '4:2:0' if '420' in pix or 'yuv420' in pix or 'p010' in pix else '4:2:2' if '422' in pix else '4:4:4' if '444' in pix else pix
            print(f"  Chroma subsampling             : {chroma}")
            print(f"  Bit depth                      : {depth} bits")
        if s.get('bit_rate') and s['bit_rate'] != 'N/A':
            print(f"  Bit rate                       : {fmt_bitrate(s['bit_rate'])}")
        if s.get('color_space'):
            print(f"  Color space                    : {s['color_space']}")
        if s.get('color_primaries'):
            print(f"  Color primaries                : {s['color_primaries']}")
        if s.get('color_transfer'):
            print(f"  Transfer characteristics       : {s['color_transfer']}")
        if s.get('color_range'):
            print(f"  Color range                    : {s['color_range']}")
        stags = {k.replace('tags.', ''): v for k, v in s.items() if k.startswith('tags.')}
        if stags.get('title'):
            print(f"  Title                          : {stags['title']}")
        if stags.get('ENCODING_SETTINGS'):
            print(f"  ENCODING_SETTINGS              : {stags['ENCODING_SETTINGS']}")

    elif codec_type == 'audio':
        print(f"\nAudio (Track {idx})")
        print(f"  Format                         : {s.get('codec_long_name', s.get('codec_name', 'unknown'))}")
        if s.get('channels'):
            ch = int(s['channels'])
            layouts = {1: '1.0', 2: '2.0', 3: '2.1', 6: '5.1', 8: '7.1'}
            layout = s.get('channel_layout', layouts.get(ch, f'{ch} channels'))
            print(f"  Channel(s)                     : {ch}")
            print(f"  Channel layout                 : {layout}")
        if s.get('sample_rate'):
            print(f"  Sampling rate                  : {int(s['sample_rate'])/1000:.1f} kHz")
        if s.get('bit_rate') and s['bit_rate'] != 'N/A':
            print(f"  Bit rate                       : {fmt_bitrate(s['bit_rate'])}")
        if s.get('bits_per_raw_sample'):
            print(f"  Bit depth                      : {s['bits_per_raw_sample']} bits")
        stags = {k.replace('tags.', ''): v for k, v in s.items() if k.startswith('tags.')}
        lang = stags.get('language', 'und')
        print(f"  Language                       : {lang}")
        if stags.get('title'):
            print(f"  Title                          : {stags['title']}")

    elif codec_type == 'subtitle':
        print(f"\nSubtitle (Track {idx})")
        print(f"  Format                         : {s.get('codec_long_name', s.get('codec_name', 'unknown'))}")
        stags = {k.replace('tags.', ''): v for k, v in s.items() if k.startswith('tags.')}
        lang = stags.get('language', 'und')
        print(f"  Language                       : {lang}")
        if stags.get('title'):
            print(f"  Title                          : {stags['title']}")

print()
PY
  else
    echo "Neither mediainfo nor ffprobe is installed."
    exit 1
  fi

  echo ""
done
