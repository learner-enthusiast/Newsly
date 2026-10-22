import type {
  CreateVideoScriptBody,
  VideoScriptResponse,
} from "@/services/videoScript/videoScriptTypes";

export function videoScriptQueryKey(storyId: string) {
  return ["videoScript", storyId] as const;
}

export async function fetchVideoScript(
  storyId: string,
  signal?: AbortSignal,
): Promise<VideoScriptResponse> {
  const response = await fetch(`/api/news/stories/${storyId}/script`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });
  const payload = (await response.json()) as VideoScriptResponse & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to load video script");
  }
  return payload;
}

export async function requestVideoScript(
  storyId: string,
  body: Partial<CreateVideoScriptBody>,
): Promise<{ scriptId: string; reused: boolean }> {
  const response = await fetch(`/api/news/stories/${storyId}/script`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as {
    scriptId?: string;
    reused?: boolean;
    error?: string;
  };
  if (!response.ok || !payload.scriptId) {
    throw new Error(payload.error ?? "Failed to start video script");
  }
  return { scriptId: payload.scriptId, reused: Boolean(payload.reused) };
}
