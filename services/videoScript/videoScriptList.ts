import { listLatestVideoScriptsForUser } from "@/repositories/videoScript";
import {
  toVideoScriptListItem,
  type VideoScriptListItem,
} from "@/services/videoScript/videoScriptListItem";

export async function listVideoScriptsForUser(
  userId: string,
): Promise<VideoScriptListItem[]> {
  const rows = await listLatestVideoScriptsForUser(userId);
  return rows.map(toVideoScriptListItem);
}
