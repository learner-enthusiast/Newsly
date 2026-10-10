/** Step 1 guard: rerun only when explicitly flagged on the NewsRequest. */
export function shouldRunNewsRerunPipeline(isRerunning: boolean): boolean {
  return isRerunning === true;
}
