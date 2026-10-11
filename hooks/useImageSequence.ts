"use client";

import {
  framePath,
  manifestPath,
  MOBILE_FRAMES_QUERY,
  type FrameManifest,
  type FrameSet,
} from "@/lib/landing/frames";
import { useEffect, useRef, useState } from "react";

const LERP_TAU = 8;
/** Snap distance, in frames. */
const SNAP = 0.05;
const CONCURRENCY = 6;
/** Mobile keeps at most this many frames decoded; the rest stay as Blobs. */
const MOBILE_MAX_DECODED = 60;
/** Frames decoded either side of the current one (mobile). */
const WARM = 6;
const MAX_DPR = 2;

const isDev = process.env.NODE_ENV !== "production";

/** Dev-only live counts so remounts can be checked for leaks. */
const live = { raf: 0, bitmaps: 0 };
function count(kind: keyof typeof live, delta: number) {
  if (!isDev) return;
  live[kind] += delta;
  (window as { __landingSeq?: typeof live }).__landingSeq = { ...live };
  if (kind === "raf") console.debug("[landing] sequence", { ...live });
}

/** Progressive load order: 0, every 8th, every 4th, every 2nd, then the rest. */
export function loadOrder(total: number): number[] {
  const order: number[] = [];
  const seen = new Set<number>();
  for (const step of [total, 8, 4, 2, 1]) {
    for (let i = 0; i < total; i += step) {
      if (seen.has(i)) continue;
      seen.add(i);
      order.push(i);
    }
  }
  return order;
}

/**
 * Scrubs a pre-rendered WebP image sequence on a canvas from window scroll
 * progress across the container. Frames stream in progressively; the nearest
 * loaded frame is drawn, so scrubbing works at once and sharpens as they land.
 *
 * Attach `containerRef` to the scroll track, `canvasRef` to the canvas and
 * `posterRef` to the SSR frame-0 `<img>` (decoded directly, not refetched).
 */
export function useImageSequence() {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const poster = useRef<HTMLImageElement>(null);
  const [progress, setProgress] = useState(0);
  const [canvasLive, setCanvasLive] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    const containerEl = container.current;
    const canvasEl = canvas.current;
    const ctx = canvasEl?.getContext("2d");
    if (!containerEl || !canvasEl || !ctx) return;

    // Bumped on cleanup so late results from this mount are dropped.
    const builds = generation;
    const gen = ++builds.current;
    const stale = () => builds.current !== gen;
    const abort = new AbortController();
    const { signal } = abort;
    const reduceMql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const set: FrameSet = window.matchMedia(MOBILE_FRAMES_QUERY).matches
      ? "mobile"
      : "desktop";
    const maxDecoded = set === "mobile" ? MOBILE_MAX_DECODED : Infinity;
    const keepBlobs = Number.isFinite(maxDecoded);

    // Frame store
    let total = 0;
    const bitmaps: (ImageBitmap | null)[] = [];
    const blobs: (Blob | null)[] = [];
    const decoding = new Set<number>();
    let decodedCount = 0;
    let current = 0;

    const store = (i: number, bmp: ImageBitmap) => {
      if (stale() || bitmaps[i]) {
        bmp.close();
        return;
      }
      bitmaps[i] = bmp;
      decodedCount++;
      count("bitmaps", 1);
      evict();
    };

    // Over budget: drop decoded frames farthest from the current one. Frame 0
    // (the poster) and the warm window stay.
    const evict = () => {
      if (decodedCount <= maxDecoded) return;
      const at = Math.round(current);
      const far: number[] = [];
      for (let i = 1; i < bitmaps.length; i++) {
        if (bitmaps[i] && Math.abs(i - at) > WARM) far.push(i);
      }
      far.sort((a, b) => Math.abs(b - at) - Math.abs(a - at));
      for (const i of far) {
        if (decodedCount <= maxDecoded) break;
        bitmaps[i]!.close();
        bitmaps[i] = null;
        decodedCount--;
        count("bitmaps", -1);
      }
    };

    const decodeBlob = (i: number) => {
      const blob = blobs[i];
      if (!blob || bitmaps[i] || decoding.has(i)) return;
      decoding.add(i);
      createImageBitmap(blob)
        .then((bmp) => store(i, bmp), () => {})
        .finally(() => decoding.delete(i));
    };

    const warm = (at: number) => {
      for (let j = Math.max(0, at - WARM); j <= Math.min(total - 1, at + WARM); j++) {
        decodeBlob(j);
      }
    };

    // Canvas sizing (device pixels, DPR capped)
    let needsDraw = true;
    const resize = () => {
      const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(canvasEl.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvasEl.clientHeight * dpr));
      if (w === canvasEl.width && h === canvasEl.height) return;
      canvasEl.width = w;
      canvasEl.height = h;
      needsDraw = true;
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvasEl);

    // Drawing (object-fit: cover, centred — same crop as the poster)
    let drawnIndex = -1;
    let painted = false;
    const draw = (i: number) => {
      const bmp = bitmaps[i];
      if (!bmp) return;
      const cw = canvasEl.width;
      const ch = canvasEl.height;
      const scale = Math.max(cw / bmp.width, ch / bmp.height);
      const sw = cw / scale;
      const sh = ch / scale;
      ctx.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, cw, ch);
      drawnIndex = i;
      needsDraw = false;
      canvasEl.dataset.frame = String(i);
      if (!painted) {
        painted = true;
        performance.mark("landing:frame0");
        setCanvasLive(true);
      }
    };

    /** Nearest decoded frame to `at`, searching outward. */
    const nearestDecoded = (at: number) => {
      const n = Math.max(total, 1);
      for (let d = 0; d < n; d++) {
        if (bitmaps[at - d]) return at - d;
        if (bitmaps[at + d]) return at + d;
      }
      return -1;
    };

    // Scroll
    let span = 1;
    const measure = () => {
      span = Math.max(1, containerEl.offsetHeight - window.innerHeight);
    };
    measure();

    // rAF loop
    let rafId = 0;
    let last = performance.now();
    let warmedAt = -1;
    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      const p = Math.min(1, Math.max(0, window.scrollY / span));
      setProgress(p);
      if (!bitmaps[0] && total === 0) return;

      const target = total > 1 ? p * (total - 1) : 0;
      if (reduceMql.matches) {
        current = target;
      } else {
        current += (target - current) * (1 - Math.exp(-dt * LERP_TAU));
        if (Math.abs(target - current) < SNAP) current = target;
      }

      const at = Math.round(current);
      if (keepBlobs && at !== warmedAt) {
        warmedAt = at;
        warm(at);
      }
      const i = nearestDecoded(at);
      if (i >= 0 && (i !== drawnIndex || needsDraw)) draw(i);
    };

    // Loading
    let settled = 0;
    let coarseLeft = 0;
    const onSettled = (i: number) => {
      settled++;
      if (i % 8 === 0 && --coarseLeft === 0) performance.mark("landing:coarse");
      if (settled === total) performance.mark("landing:all");
    };

    const loadFrame = async (i: number) => {
      const res = await fetch(framePath(set, i), { signal });
      if (!res.ok) throw new Error(`frame ${i}: HTTP ${res.status}`);
      const blob = await res.blob();
      if (stale()) return;
      if (keepBlobs) blobs[i] = blob;
      if (decodedCount < maxDecoded || Math.abs(i - Math.round(current)) <= WARM) {
        store(i, await createImageBitmap(blob));
      }
    };

    const runQueue = async (order: number[]) => {
      let next = 0;
      const worker = async () => {
        while (!stale() && next < order.length) {
          const i = order[next++]!;
          try {
            await loadFrame(i);
          } catch (e) {
            if (signal.aborted) return;
            if (isDev) console.warn("[landing] frame failed", e);
          }
          if (!stale()) onSettled(i);
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    };

    // Frame 0: decode the poster <img> when it's the same file, else fetch.
    const loadFirst = async (): Promise<ImageBitmap> => {
      const img = poster.current;
      if (img && img.currentSrc.endsWith(framePath(set, 0))) {
        if (!img.complete) {
          await new Promise<void>((resolve, reject) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", reject, { once: true });
            signal.addEventListener("abort", reject, { once: true });
          });
        }
        if (img.naturalWidth > 0) return createImageBitmap(img);
      }
      const res = await fetch(framePath(set, 0), { signal });
      if (!res.ok) throw new Error(`frame 0: HTTP ${res.status}`);
      return createImageBitmap(await res.blob());
    };

    const start = async () => {
      try {
        const manifest = fetch(manifestPath(set), { signal }).then((r) => {
          if (!r.ok) throw new Error(`manifest: HTTP ${r.status}`);
          return r.json() as Promise<FrameManifest>;
        });
        manifest.catch(() => {}); // awaited below; don't flag an abort as unhandled
        store(0, await loadFirst());
        const { count: frames } = await manifest;
        if (stale()) return;
        total = frames;
        bitmaps.length = Math.max(bitmaps.length, total);
        settled = 1;
        coarseLeft = Math.ceil(total / 8) - 1;
        if (coarseLeft <= 0) performance.mark("landing:coarse");
        // Let frame 0 paint, then stream the rest.
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        if (!stale()) await runQueue(loadOrder(total).slice(1));
      } catch (e) {
        if (!signal.aborted && isDev) console.warn("[landing] sequence failed", e);
      }
    };

    const onResize = () => {
      measure();
      resize();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    rafId = requestAnimationFrame(tick);
    count("raf", 1);
    void start();

    return () => {
      builds.current++;
      cancelAnimationFrame(rafId);
      count("raf", -1);
      abort.abort();
      resizeObserver.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      for (const bmp of bitmaps) {
        if (!bmp) continue;
        bmp.close();
        count("bitmaps", -1);
      }
      bitmaps.length = 0;
      blobs.length = 0;
    };
  }, []);

  return {
    containerRef: container,
    canvasRef: canvas,
    posterRef: poster,
    progress,
    canvasLive,
  };
}
