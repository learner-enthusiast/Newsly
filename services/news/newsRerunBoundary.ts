/** Establish the rerun time boundary from persisted request/story metadata. */
export function resolveNewsRerunResearchBoundary(input: {
  completedAt: Date | null;
  createdAt: Date;
  storyUpdatedAtMax: Date | null;
  sourcePublishedAtMax: Date | null;
}): Date {
  const candidates: Date[] = [input.createdAt];
  if (input.completedAt) {
    candidates.push(input.completedAt);
  }
  if (input.storyUpdatedAtMax) {
    candidates.push(input.storyUpdatedAtMax);
  }
  if (input.sourcePublishedAtMax) {
    candidates.push(input.sourcePublishedAtMax);
  }
  return new Date(Math.max(...candidates.map((d) => d.getTime())));
}

export function boundaryToIsoDate(boundary: Date): string {
  return boundary.toISOString().slice(0, 10);
}
