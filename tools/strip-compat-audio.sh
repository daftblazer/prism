#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Removes "compatibility" audio tracks while preserving commentary and everything else.
# Detection modes:
#   1) Name-based via COMPAT_REGEX (case-insensitive, optional).
#   2) Automatic: lower-quality duplicate language tracks following a higher-quality one.
#      Example: English TrueHD (keep) followed by English AC-3 (drop).
# Commentary tracks (name containing "commentary") are always kept.

: "${DRY_RUN:=0}"
: "${INPUT_DIR:=Output}"
: "${OUTPUT_DIR:=$INPUT_DIR}"
: "${TARGET_GLOB:=*.mkv}"
: "${COMPAT_REGEX:='(?i)compat'}"   # leave empty to disable name-based detection
: "${AUTO_COMPAT_DETECT:=1}"        # 1=on, 0=off
: "${DEBUG:=0}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 1; }; }
need mkvmerge
need jq

mapfile -d '' -t files < <(find "$INPUT_DIR" -maxdepth 1 -type f -name "$TARGET_GLOB" -print0 | sort -z)

if [[ ${#files[@]} -eq 0 ]]; then
  echo "No files matching $TARGET_GLOB in $INPUT_DIR"
  exit 0
fi

is_commentary() {
  local name="${1:-}"
  [[ "$name" =~ [Cc]ommentary ]]
}

is_compat_track() {
  local name="${1:-}"
  [[ -n "$COMPAT_REGEX" && "$name" =~ $COMPAT_REGEX ]]
}

codec_rank() {
  local c="${1:-}"
  local u="${c^^}"
  case "$u" in
    *TRUEHD*) echo 95 ;;
    *DTS*HD*MA*|*DTSHD*MA*|*DTS-HD.MA*|*DTS-HD*XLL*|*A_DTSHD*) echo 90 ;;
    *DTS*HD*HRA*|*HRA*) echo 85 ;;
    *FLAC*) echo 82 ;;
    *PCM*|*LPCM*) echo 80 ;;
    *E-AC-3*|*EAC3*|*DDP*|*DD+*) echo 75 ;;
    *DTS*) echo 70 ;;
    *AC-3*|*AC3*|*A_AC3*|*DD*) echo 60 ;;
    *OPUS*) echo 50 ;;
    *AAC*|*MP4A*) echo 45 ;;
    *MP3*|*MPEG/L3*) echo 35 ;;
    *) echo 55 ;; # default midrank to avoid over-removal
  esac
}

for src in "${files[@]}"; do
  base="$(basename "$src")"
  out="$OUTPUT_DIR/$base"

  echo "==> $base"

  media_json="$(mkvmerge -J "$src")"

  mapfile -t audio_tracks < <(
    printf '%s' "$media_json" | jq -r '
      .tracks[]
      | select(.type=="audio")
      | [
          (.id|tostring),
          (.properties.language // "und"),
          (
            .codec // "" |
            if . == "" then (.properties.codec_id // "") else . end
          ),
          (.properties.track_name // "")
        ]
      | @tsv
    '
  )

  keep_ids=()
  removed_ids=()
  unset best_rank_by_lang lang_count lang_track_desc seen_ids
  declare -A best_rank_by_lang
  declare -A lang_count
  declare -A lang_track_desc
  declare -A seen_ids

  # Collect audio track metadata first (order-agnostic detection).
  tracks_meta=()

  if [[ ${#audio_tracks[@]} -eq 0 ]]; then
    echo "  (no audio tracks found) -> skipping"
    continue
  fi

  for line in "${audio_tracks[@]}"; do
    IFS=$'\t' read -r id lang codec name <<<"$line"

    # Deduplicate in case mkvmerge -J parsing yields accidental repeats
    if [[ -n "${seen_ids[$id]:-}" ]]; then
      continue
    fi
    seen_ids[$id]=1

    rank=$(codec_rank "$codec")

    # Track counts/descriptions per language for warnings.
    lang_count["$lang"]=$(( ${lang_count[$lang]:-0} + 1 ))
    lang_track_desc["$lang"]+=$(printf "  - id=%s name=\"%s\" codec=\"%s\"\n" "$id" "$name" "$codec")

    is_name_compat=false
    if is_compat_track "$name" && ! is_commentary "$name"; then
      is_name_compat=true
    fi

    # Collect per-track metadata
    comm_flag=$(is_commentary "$name"; echo $?)
    tracks_meta+=("$id|$name|$lang|$codec|$rank|$is_name_compat|$comm_flag")

    if [[ "$DEBUG" -eq 1 ]]; then
      echo "    track id=$id lang=$lang codec='$codec' rank=$rank name='$name' commentary=$comm_flag nameCompat=$is_name_compat"
    fi

    # Track best rank per language (max) for later order-agnostic compat detection
    [[ "$rank" -gt "${best_rank_by_lang[$lang]:--1}" ]] && best_rank_by_lang[$lang]="$rank"
  done

  # Warn if 3+ tracks share the same language (could indicate commentary/alt audio).
  warn_multi_lang=0
  for lang in "${!lang_count[@]}"; do
    if [[ ${lang_count[$lang]} -ge 3 ]]; then
      printf '  WARNING: %s has %d audio tracks in language "%s":\n%s\n' \
        "$base" "${lang_count[$lang]}" "$lang" "${lang_track_desc[$lang]}"
      warn_multi_lang=1
    fi
  done
  if [[ $warn_multi_lang -eq 1 ]]; then
    echo "  Aborting: review this file manually to avoid stripping commentary/alt mixes."
    exit 1
  fi

  # Second pass: decide keep/remove using max rank per language (order independent).
  for meta in "${tracks_meta[@]}"; do
    IFS='|' read -r id name lang codec rank is_name_compat commentary_flag <<<"$meta"

    is_auto_compat=false
    if [[ "$AUTO_COMPAT_DETECT" -eq 1 && "$commentary_flag" -ne 0 ]]; then
      best="${best_rank_by_lang[$lang]:--1}"
      if [[ "$best" -gt -1 && "$rank" -lt "$best" ]]; then
        is_auto_compat=true
      fi
    fi

    if { [[ "$is_name_compat" == true ]] || [[ "$is_auto_compat" == true ]]; } && [[ "$commentary_flag" -ne 0 ]]; then
      removed_ids+=("$id")
      decision="REMOVE"
    else
      keep_ids+=("$id")
      decision="KEEP"
    fi

    if [[ "$DEBUG" -eq 1 ]]; then
      echo "      decision for id=$id: autoCompat=$is_auto_compat nameCompat=$is_name_compat commentary=$commentary_flag -> $decision"
    fi
  done

  if [[ ${#removed_ids[@]} -eq 0 ]]; then
    echo "  No compatibility audio tracks detected; skipping rewrite."
    continue
  fi

  if [[ ${#keep_ids[@]} -eq 0 ]]; then
    echo "  ERROR: all audio tracks flagged as compatibility; refusing to mux to avoid silent removal."
    continue
  fi
  keep_csv="$(IFS=,; echo "${keep_ids[*]}")"
  (
    IFS=' '
    echo "  Removing audio track IDs: ${removed_ids[*]:-(none)}"
    echo "  Keeping audio track IDs:  ${keep_ids[*]}"
  )

  tmp_out="$(dirname "$out")/.tmp.$(basename "$out")"
  cmd=(mkvmerge -o "$tmp_out" --audio-tracks "$keep_csv" "$src")

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "  [dry-run] ${cmd[*]}"
  else
    "${cmd[@]}"
    mv -- "$tmp_out" "$out"
  fi
done

echo "Done. Output -> $OUTPUT_DIR"
