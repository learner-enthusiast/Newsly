/**
 * Landing hero image sequence (built by `scripts/build-hero-frames.sh`).
 * Bump the version in the path whenever the frames are regenerated: they are
 * served with an immutable cache header.
 */

export const FRAMES_BASE = "/landing/frames/v1";

export type FrameSet = "desktop" | "mobile";

/** Viewports narrower than 768px load the mobile set. */
export const MOBILE_FRAMES_QUERY = "(max-width: 767px)";

export type FrameManifest = { count: number; width: number; height: number };

export function framePath(set: FrameSet, index: number): string {
  return `${FRAMES_BASE}/${set}/${String(index).padStart(4, "0")}.webp`;
}

export function manifestPath(set: FrameSet): string {
  return `${FRAMES_BASE}/${set}/manifest.json`;
}

export const POSTER = {
  desktop: framePath("desktop", 0),
  mobile: framePath("mobile", 0),
} as const;
