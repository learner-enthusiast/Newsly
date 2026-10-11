#!/usr/bin/env bash
# Builds the landing hero image sequence from the hero video.
#
#   scripts/build-hero-frames.sh
#
# Source: tmp/hero-source.mp4 (downloaded from HERO_SOURCE_VIDEO in lib/landing/content.ts
# if missing). Output: public/landing/frames/$VERSION/{desktop,mobile}/0000.webp…
# plus manifest.json ({ count, width, height }) per set.
#
# Frames are evenly spaced over the whole clip and never upscaled. Override any
# setting via env, e.g. DESKTOP_Q=68 scripts/build-hero-frames.sh. Bump VERSION
# whenever the output changes: the frames are served with an immutable cache.
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="${VERSION:-v1}"
SRC="${SRC:-tmp/hero-source.mp4}"
DESKTOP_COUNT="${DESKTOP_COUNT:-120}" DESKTOP_WIDTH="${DESKTOP_WIDTH:-1920}" DESKTOP_Q="${DESKTOP_Q:-72}"
MOBILE_COUNT="${MOBILE_COUNT:-80}" MOBILE_WIDTH="${MOBILE_WIDTH:-1080}" MOBILE_Q="${MOBILE_Q:-70}"
OUT_ROOT="public/landing/frames/$VERSION"

for bin in ffmpeg ffprobe; do
  command -v "$bin" >/dev/null || { echo "error: $bin not found" >&2; exit 1; }
done

if [[ ! -f "$SRC" ]]; then
  url="$(grep -oE 'https://[^"]+\.mp4' lib/landing/content.ts | head -1)"
  [[ -n "$url" ]] || { echo "error: no video URL in lib/landing/content.ts" >&2; exit 1; }
  echo "Downloading $url -> $SRC"
  mkdir -p "$(dirname "$SRC")"
  curl -fL --retry 3 -o "$SRC.part" "$url"
  mv "$SRC.part" "$SRC"
fi

probe() { ffprobe -v error -select_streams v:0 "$@" -of csv=p=0 "$SRC"; }
total="$(probe -count_packets -show_entries stream=nb_read_packets)"
src_width="$(probe -show_entries stream=width)"
echo "Source: $SRC — $total frames, ${src_width}px wide"

# build_set <name> <count> <max-width> <quality>
build_set() {
  local name="$1" count="$2" max_width="$3" quality="$4"
  local width=$(( max_width < src_width ? max_width : src_width ))
  local dir="$OUT_ROOT/$name"
  (( count <= total )) || { echo "error: $name wants $count of $total frames" >&2; exit 1; }

  # Evenly spaced source frame indices: round(i * (total-1) / (count-1)).
  local expr="" i idx
  for (( i = 0; i < count; i++ )); do
    if (( count == 1 )); then idx=0; else idx=$(( (2 * i * (total - 1) + (count - 1)) / (2 * (count - 1)) )); fi
    expr+="${expr:++}eq(n\\,$idx)"
  done

  rm -rf "$dir"
  mkdir -p "$dir"
  ffmpeg -v error -i "$SRC" \
    -vf "select='$expr',scale=${width}:-2:flags=lanczos" \
    -fps_mode passthrough -an \
    -c:v libwebp -quality "$quality" -compression_level 6 -preset photo \
    -start_number 0 "$dir/%04d.webp"

  local made height bytes
  made="$(find "$dir" -name '*.webp' | wc -l)"
  (( made == count )) || { echo "error: $name produced $made of $count frames" >&2; exit 1; }
  height="$(ffprobe -v error -show_entries stream=height -of csv=p=0 "$dir/0000.webp")"
  printf '{ "count": %d, "width": %d, "height": %d }\n' "$count" "$width" "$height" > "$dir/manifest.json"
  bytes="$(du -cb "$dir"/*.webp | tail -1 | cut -f1)"
  printf '%-8s %3d frames  %4dx%-4d  q%-3d  %6.2f MB  (avg %d KB)\n' \
    "$name" "$count" "$width" "$height" "$quality" \
    "$(echo "$bytes / 1000000" | bc -l)" "$(( bytes / count / 1000 ))"
}

build_set desktop "$DESKTOP_COUNT" "$DESKTOP_WIDTH" "$DESKTOP_Q"
build_set mobile "$MOBILE_COUNT" "$MOBILE_WIDTH" "$MOBILE_Q"
