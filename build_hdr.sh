#!/usr/bin/env bash
set -euo pipefail

# ---- Defaults (override via env or flags) ----
REPO_URL="${REPO_URL:-https://github.com/juliobbv-p/svt-av1-hdr.git}"
BRANCH="${BRANCH:-main}"
# Use /config/encoders if it exists (Docker), else fall back to project dir
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -d "/config/encoders" ]]; then
  DEFAULT_PREFIX="/config/encoders/hdr"
else
  DEFAULT_PREFIX="$SCRIPT_DIR/config/encoders/hdr"
fi
PREFIX="${PREFIX:-$DEFAULT_PREFIX}"
JOBS="${JOBS:-$(nproc)}"
BUILD_TYPE="${BUILD_TYPE:-Release}"
UPDATE_MODE="rebase-safe" # or: pull
SRC_DIR="${SRC_DIR:-}"
BUILD_DIR="${BUILD_DIR:-}"
TEMP_ROOT=""
USE_TEMP_WORKDIR=1

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  --prefix PATH        Install prefix (default: $PREFIX)
  --src PATH           Persistent source dir (default: temp workspace)
  --build PATH         Build dir (default: <src>/build-hdr)
  --jobs N             Parallel jobs (default: $JOBS)
  --update [pull|reset]
                       pull  = git pull (may conflict on rebases)
                       reset = git fetch && git reset --hard origin/main (default)
  --clean              Delete build dir before configuring
  --keep-workdir       Keep temp workspace instead of auto-cleaning it
  --no-install         Build only (skip install)
  -h, --help           Show help

Notes:
- Installs ONLY into --prefix. Nothing goes to /usr or /usr/local.
- Binary will be at: <prefix>/bin/SvtAv1EncApp
- Libraries at: <prefix>/lib (we set RPATH so the binary finds them).
- With default temp workspace mode, rerunning this script pulls latest code and updates
  your installed encoder without leaving source/build artifacts behind.
EOF
}

CLEAN=0
DO_INSTALL=1
KEEP_WORKDIR=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prefix) PREFIX="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --src)
      SRC_DIR="$2"
      USE_TEMP_WORKDIR=0
      shift 2
      ;;
    --build)
      BUILD_DIR="$2"
      USE_TEMP_WORKDIR=0
      shift 2
      ;;
    --jobs) JOBS="$2"; shift 2 ;;
    --update)
      case "${2:-}" in
        pull) UPDATE_MODE="pull"; shift 2 ;;
        reset) UPDATE_MODE="rebase-safe"; shift 2 ;;
        *) echo "Bad --update value (use pull|reset)"; exit 2 ;;
      esac
      ;;
    --clean) CLEAN=1; shift ;;
    --keep-workdir) KEEP_WORKDIR=1; shift ;;
    --no-install) DO_INSTALL=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1"; usage; exit 2 ;;
  esac
done

need_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1"; exit 1; }; }

# ---- Tools we rely on ----
need_cmd git
need_cmd cmake
need_cmd ninja

# ---- Workspace selection ----
if [[ "$USE_TEMP_WORKDIR" -eq 1 ]]; then
  TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/hdr-build.XXXXXX")"
  SRC_DIR="$TEMP_ROOT/src"
  BUILD_DIR="$TEMP_ROOT/build"
  CLEAN=1
  if [[ "$KEEP_WORKDIR" -eq 0 ]]; then
    trap 'rm -rf "$TEMP_ROOT"' EXIT
  fi
  echo "==> Using temporary workspace: $TEMP_ROOT"
else
  if [[ -z "$SRC_DIR" ]]; then
    SRC_DIR="$HOME/src/svt-av1-hdr"
  fi
  if [[ -z "$BUILD_DIR" ]]; then
    BUILD_DIR="$SRC_DIR/build-hdr"
  fi
fi

# ---- Clone/update ----
if [[ ! -d "$SRC_DIR/.git" ]]; then
  echo "==> Cloning $REPO_URL (branch: $BRANCH) -> $SRC_DIR"
  git clone --recursive -b "$BRANCH" "$REPO_URL" "$SRC_DIR"
else
  echo "==> Updating repo in $SRC_DIR"
  pushd "$SRC_DIR" >/dev/null
  if [[ "$UPDATE_MODE" == "pull" ]]; then
    git pull --rebase --autostash
  else
    git fetch origin
    git reset --hard "origin/$BRANCH"
    git submodule update --init --recursive
  fi
  popd >/dev/null
fi

# ---- Clean build dir if requested ----
if [[ "$CLEAN" -eq 1 ]]; then
  echo "==> Cleaning build dir: $BUILD_DIR"
  rm -rf "$BUILD_DIR"
fi

mkdir -p "$BUILD_DIR" "$PREFIX"

# ---- Configure ----
# RPATH makes the installed binary use <prefix>/lib without needing LD_LIBRARY_PATH.
echo "==> Configuring (Release) with private prefix: $PREFIX"
cmake -S "$SRC_DIR" -B "$BUILD_DIR" -G Ninja \
  -DCMAKE_BUILD_TYPE="$BUILD_TYPE" \
  -DCMAKE_INSTALL_PREFIX="$PREFIX" \
  -DCMAKE_INSTALL_RPATH="\$ORIGIN/../lib" \
  -DCMAKE_BUILD_WITH_INSTALL_RPATH=ON

# ---- Build ----
echo "==> Building with $JOBS jobs"
cmake --build "$BUILD_DIR" -- -j "$JOBS"

# ---- Install (to prefix only) ----
if [[ "$DO_INSTALL" -eq 1 ]]; then
  echo "==> Installing into $PREFIX (not system-wide)"
  cmake --install "$BUILD_DIR"
fi

# ---- Convenience wrapper (optional but handy) ----
WRAPPER="$PREFIX/bin/hdr"
if [[ "$DO_INSTALL" -eq 1 ]]; then
  cat >"$WRAPPER" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# If RPATH works, this is unnecessary; but it doesn't hurt as a fallback.
export LD_LIBRARY_PATH="$ROOT/lib64:$ROOT/lib:${LD_LIBRARY_PATH:-}"
exec "$ROOT/bin/SvtAv1EncApp" "$@"
EOF
  chmod +x "$WRAPPER"
fi

echo
echo "Done."
echo "Prefix:  $PREFIX"
echo "Encoder: $PREFIX/bin/SvtAv1EncApp"
echo "Wrapper: $PREFIX/bin/hdr"
if [[ "$USE_TEMP_WORKDIR" -eq 1 ]]; then
  if [[ "$KEEP_WORKDIR" -eq 1 ]]; then
    echo "Workspace kept: $TEMP_ROOT"
  else
    echo "Workspace cleaned: $TEMP_ROOT"
  fi
fi
