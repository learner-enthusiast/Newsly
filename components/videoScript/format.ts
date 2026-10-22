/** 75 → "1:15"; 4.2 → "0:04". */
export function formatSeconds(totalSec: number): string {
  const whole = Math.max(0, Math.round(totalSec));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
