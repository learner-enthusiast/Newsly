"use client";

import type { MP4Sample, MP4VideoTrack } from "mp4box";
import { useEffect, useRef, useState, type RefObject } from "react";

const LERP_TAU = 8;
const SNAP = 0.002;
const LRU_MAX = 24;
const LEAD = 24;
const WATCHDOG_MS = 60_000;

type BankEntry = { ts: number; blob: Blob };

type ScrubRefs = {
  container: RefObject<HTMLElement | null>;
  video: RefObject<HTMLVideoElement | null>;
  canvas: RefObject<HTMLCanvasElement | null>;
};

type Demuxed = {
  track: MP4VideoTrack;
  samples: MP4Sample[];
  description: Uint8Array | undefined;
  durationSec: number;
};

const isDev = process.env.NODE_ENV !== "production";

/** Dev-only live counts so remounts can be checked for leaked loops/decoders. */
const live = { raf: 0, decoders: 0 };
function count(kind: keyof typeof live, delta: number) {
  if (!isDev) return;
  live[kind] += delta;
  (window as { __landingScrub?: typeof live }).__landingScrub = { ...live };
  console.debug("[landing] scrub", { ...live });
}

async function demux(buffer: ArrayBuffer): Promise<Demuxed> {
  const mod = await import("mp4box");
  const MP4Box = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const file = MP4Box.createFile();
  const parsed: { info?: import("mp4box").MP4Info; error?: string } = {};
  file.onReady = (info) => {
    parsed.info = info;
  };
  file.onError = (error) => {
    parsed.error = error;
  };
  const ab = buffer as import("mp4box").MP4ArrayBuffer;
  ab.fileStart = 0;
  file.appendBuffer(ab);
  file.flush();

  const info = parsed.info;
  if (!info) throw new Error(parsed.error ?? "mp4 not parsed");
  const track = info.videoTracks[0];
  if (!track) throw new Error("no video track");

  let description: Uint8Array | undefined;
  for (const entry of file.getTrackById(track.id).mdia.minf.stbl.stsd.entries) {
    const box = entry.avcC ?? entry.hvcC ?? entry.vpcC ?? entry.av1C;
    if (!box) continue;
    const stream = new MP4Box.DataStream(
      undefined,
      0,
      MP4Box.DataStream.BIG_ENDIAN,
    );
    box.write(stream);
    description = new Uint8Array(stream.buffer, 8); // drop the box header
    break;
  }

  const samples: MP4Sample[] = [];
  file.onSamples = (_id, _user, batch) => {
    samples.push(...batch);
  };
  file.setExtractionOptions(track.id, null, { nbSamples: track.nb_samples });
  file.start();
  file.stop();

  return {
    track,
    samples,
    description,
    durationSec: info.duration / info.timescale,
  };
}

/**
 * Drives a muted `<video>` (and, once decoded, a `<canvas>` frame bank) from
 * window scroll progress across `container`. Never calls `play()`.
 */
export function useVideoScrub(
  videoSrc: string,
  { container, video, canvas }: ScrubRefs,
): { progress: number; canvasLive: boolean } {
  const [progress, setProgress] = useState(0);
  const [canvasLive, setCanvasLive] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    const containerEl = container.current;
    const videoEl = video.current;
    const canvasEl = canvas.current;
    if (!containerEl || !videoEl || !canvasEl) return;

    // Bumped on cleanup so late results from this build are ignored.
    const builds = generation;
    const gen = ++builds.current;
    const stale = () => builds.current !== gen;
    const reduceMql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const ctx = canvasEl.getContext("2d");
    const abort = new AbortController();

    // Scroll span
    let span = 1;
    const measure = () => {
      span = Math.max(1, containerEl.offsetHeight - window.innerHeight);
    };
    measure();
    const getProgress = () => Math.min(1, Math.max(0, window.scrollY / span));

    // Video fallback state
    let dur = 0;
    let seeking = false;
    const onMeta = () => {
      if (Number.isFinite(videoEl.duration) && videoEl.duration > 0) {
        dur = videoEl.duration;
      }
    };
    const onSeeking = () => {
      seeking = true;
    };
    const onSeeked = () => {
      seeking = false;
    };
    if (videoEl.readyState >= 1) onMeta();

    // Frame bank state
    let current = 0;
    let target = 0;
    let ready = false;
    let reverted = false;
    let painted = false;
    let building = false;
    let bank: BankEntry[] = [];
    const lru = new Map<number, ImageBitmap | null>();
    let drawnIndex = -1;
    let decoder: VideoDecoder | null = null;
    let watchdog = 0;

    const closeDecoder = () => {
      if (!decoder) return;
      if (decoder.state !== "closed") decoder.close();
      decoder = null;
      count("decoders", -1);
    };

    const dropBank = () => {
      for (const bmp of lru.values()) bmp?.close();
      lru.clear();
      bank = [];
      drawnIndex = -1;
    };

    const revert = (reason: unknown, quiet = false) => {
      if (stale() || reverted) return;
      reverted = true;
      ready = false;
      window.clearTimeout(watchdog);
      abort.abort();
      closeDecoder();
      dropBank();
      if (painted) {
        painted = false;
        setCanvasLive(false);
      }
      if (isDev && !quiet) {
        console.warn(
          "[landing] frame bank unavailable; using video seeking.",
          reason,
        );
      }
    };

    const nearestIndex = (t: number) => {
      const us = t * 1e6;
      let lo = 0;
      let hi = bank.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (bank[mid]!.ts < us) lo = mid + 1;
        else hi = mid;
      }
      if (lo > 0 && us - bank[lo - 1]!.ts <= bank[lo]!.ts - us) return lo - 1;
      return lo;
    };

    const paint = (i: number, bmp: ImageBitmap) => {
      if (!ctx) return;
      ctx.drawImage(bmp, 0, 0, canvasEl.width, canvasEl.height);
      drawnIndex = i;
      lru.delete(i);
      lru.set(i, bmp);
      if (!painted) {
        painted = true;
        setCanvasLive(true);
      }
    };

    const evict = () => {
      for (const [i, bmp] of lru) {
        if (lru.size <= LRU_MAX) break;
        if (Math.abs(i - drawnIndex) <= 2) continue;
        bmp?.close();
        lru.delete(i);
      }
    };

    const warmLRU = (i: number) => {
      for (let j = i - 1; j <= i + 2; j++) {
        if (j < 0 || j >= bank.length || lru.has(j)) continue;
        lru.set(j, null);
        createImageBitmap(bank[j]!.blob).then(
          (bmp) => {
            if (stale() || !ready || lru.get(j) !== null) {
              bmp.close();
              return;
            }
            lru.set(j, bmp);
            if (drawnIndex !== j && nearestIndex(current) === j) paint(j, bmp);
            evict();
          },
          () => {
            if (lru.get(j) === null) lru.delete(j);
          },
        );
      }
    };

    // rAF loop
    let rafId = 0;
    let last = performance.now();
    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      const p = getProgress();
      setProgress(p);
      if (dur <= 0) return;

      target = p * dur;
      if (reduceMql.matches) {
        current = target;
      } else {
        current += (target - current) * (1 - Math.exp(-dt * LERP_TAU));
        if (Math.abs(target - current) < SNAP) current = target;
      }

      if (ready) {
        const i = nearestIndex(current);
        if (i !== drawnIndex) {
          const bmp = lru.get(i);
          if (bmp) paint(i, bmp);
          warmLRU(i);
        }
      } else if (!seeking && Math.abs(videoEl.currentTime - current) > 0.01) {
        videoEl.currentTime = current;
      }
    };

    // Decode every frame to a WebP blob, throttled so decode stays at most
    // LEAD frames ahead of encoding.
    const decodeAll = (
      { track, samples, description }: Demuxed,
      hardwareAcceleration: HardwareAcceleration,
    ) =>
      new Promise<BankEntry[]>((resolve, reject) => {
        const out: BankEntry[] = [];
        const encodes: Promise<void>[] = [];
        let encoding = 0;
        let failed = false;
        let wake: (() => void) | null = null;
        const signal = () => {
          wake?.();
          wake = null;
        };
        const halted = () => failed || stale() || reverted;

        const scratch = document.createElement("canvas");
        scratch.width = canvasEl.width;
        scratch.height = canvasEl.height;
        const sctx = scratch.getContext("2d");
        if (!sctx) {
          reject(new Error("2d context unavailable"));
          return;
        }

        const dec = new VideoDecoder({
          output: (frame) => {
            if (halted()) {
              frame.close();
              return;
            }
            const ts = frame.timestamp;
            sctx.drawImage(frame, 0, 0, scratch.width, scratch.height);
            frame.close();
            encoding++;
            encodes.push(
              new Promise<void>((done) => {
                scratch.toBlob(
                  (blob) => {
                    encoding--;
                    if (blob && !halted()) out.push({ ts, blob });
                    signal();
                    done();
                  },
                  "image/webp",
                  0.82,
                );
              }),
            );
          },
          error: (e) => {
            failed = true;
            signal();
            reject(e);
          },
        });
        decoder = dec;
        count("decoders", 1);
        dec.addEventListener("dequeue", signal);
        abort.signal.addEventListener("abort", signal);

        const config: VideoDecoderConfig = {
          codec: track.codec,
          codedWidth: track.video.width,
          codedHeight: track.video.height,
          description,
          hardwareAcceleration,
        };

        (async () => {
          const support = await VideoDecoder.isConfigSupported(config);
          if (!support.supported) throw new Error(`unsupported ${track.codec}`);
          if (halted()) return;
          dec.configure(config);
          for (const s of samples) {
            while (!halted() && dec.decodeQueueSize + encoding > LEAD) {
              await new Promise<void>((r) => {
                wake = r;
              });
            }
            if (halted()) return;
            dec.decode(
              new EncodedVideoChunk({
                type: s.is_sync ? "key" : "delta",
                timestamp: (s.cts * 1e6) / s.timescale,
                duration: (s.duration * 1e6) / s.timescale,
                data: s.data,
              }),
            );
          }
          await dec.flush();
          await Promise.all(encodes);
          if (halted()) return;
          resolve(out);
        })()
          .catch(reject)
          .finally(() => {
            abort.signal.removeEventListener("abort", signal);
            if (decoder === dec) closeDecoder();
            reject(new Error("decode halted")); // no-op once settled
          });
      });

    const build = async () => {
      if (building || reverted || stale()) return;
      if (reduceMql.matches || typeof VideoDecoder === "undefined") return;
      building = true;
      watchdog = window.setTimeout(() => {
        if (!ready) revert(new Error("frame bank watchdog timeout"));
      }, WATCHDOG_MS);
      try {
        const res = await fetch(videoSrc, { signal: abort.signal });
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        const demuxed = await demux(await res.arrayBuffer());
        if (stale() || reverted) return;
        if (dur <= 0) dur = demuxed.durationSec;

        let frames: BankEntry[];
        try {
          frames = await decodeAll(demuxed, "no-preference");
        } catch (e) {
          if (stale() || reverted) return;
          if (isDev) console.debug("[landing] retrying decode in software", e);
          frames = await decodeAll(demuxed, "prefer-software");
        }
        if (stale() || reverted) return;

        window.clearTimeout(watchdog);
        bank = frames.sort((a, b) => a.ts - b.ts);
        ready = bank.length > 0;
        if (ready) warmLRU(nearestIndex(current));
        else revert(new Error("no frames decoded"));
      } catch (e) {
        if (!stale()) revert(e);
      } finally {
        building = false;
      }
    };

    const startBuild = () => void build();
    const onReduceChange = () => {
      if (reduceMql.matches) revert("reduced motion", true);
    };

    videoEl.addEventListener("loadedmetadata", onMeta);
    videoEl.addEventListener("seeking", onSeeking);
    videoEl.addEventListener("seeked", onSeeked);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    reduceMql.addEventListener("change", onReduceChange);
    if (document.readyState === "complete") startBuild();
    else window.addEventListener("load", startBuild, { once: true });

    rafId = requestAnimationFrame(tick);
    count("raf", 1);

    return () => {
      builds.current++;
      cancelAnimationFrame(rafId);
      count("raf", -1);
      window.clearTimeout(watchdog);
      window.removeEventListener("load", startBuild);
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      reduceMql.removeEventListener("change", onReduceChange);
      videoEl.removeEventListener("loadedmetadata", onMeta);
      videoEl.removeEventListener("seeking", onSeeking);
      videoEl.removeEventListener("seeked", onSeeked);
      abort.abort();
      closeDecoder();
      dropBank();
    };
  }, [videoSrc, container, video, canvas]);

  return { progress, canvasLive };
}
