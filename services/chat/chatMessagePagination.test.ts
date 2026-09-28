import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHAT_MESSAGES_PAGE_SIZE,
  compareMessagesChronologically,
  decodeChatMessageCursor,
  encodeChatMessageCursor,
  mergeChatMessagesById,
  type SerializedChatMessageListItem,
} from "./chatMessagePagination";

function message(
  id: string,
  createdAt: string,
  role = "user",
): SerializedChatMessageListItem {
  return { id, role, content: `body-${id}`, createdAt };
}

describe("chatMessagePagination", () => {
  it("uses a default page size of 10", () => {
    assert.equal(CHAT_MESSAGES_PAGE_SIZE, 10);
  });

  it("round-trips cursor encoding", () => {
    const cursor = {
      createdAt: "2026-01-02T12:00:00.000Z",
      id: "0192e4f0-0000-7000-8000-000000000001",
    };
    const encoded = encodeChatMessageCursor(cursor);
    assert.equal(
      encoded,
      "2026-01-02T12:00:00.000Z~0192e4f0-0000-7000-8000-000000000001",
    );
    assert.deepEqual(decodeChatMessageCursor(encoded), cursor);
  });

  it("merges pages without duplicates and keeps chronological order", () => {
    const older = [
      message("a", "2026-01-01T10:00:00.000Z"),
      message("b", "2026-01-01T11:00:00.000Z"),
    ];
    const newer = [
      message("b", "2026-01-01T11:00:00.000Z", "assistant"),
      message("c", "2026-01-01T12:00:00.000Z"),
    ];
    const merged = mergeChatMessagesById(older, newer);
    assert.deepEqual(
      merged.map((row) => row.id),
      ["a", "b", "c"],
    );
    assert.equal(merged[1]!.role, "assistant");
  });

  it("prepends an older page ahead of the current window", () => {
    const current = [
      message("m-51", "2026-01-01T11:00:00.000Z"),
      message("m-52", "2026-01-01T12:00:00.000Z"),
    ];
    const olderPage = [
      message("m-49", "2026-01-01T09:00:00.000Z"),
      message("m-50", "2026-01-01T10:00:00.000Z"),
    ];
    const merged = mergeChatMessagesById(olderPage, current);
    assert.deepEqual(
      merged.map((row) => row.id),
      ["m-49", "m-50", "m-51", "m-52"],
    );
  });

  it("orders by createdAt then id", () => {
    const rows = [
      message("z", "2026-01-01T10:00:00.000Z"),
      message("a", "2026-01-01T10:00:00.000Z"),
      message("m", "2026-01-01T09:00:00.000Z"),
    ];
    const sorted = [...rows].sort(compareMessagesChronologically);
    assert.deepEqual(
      sorted.map((row) => row.id),
      ["m", "a", "z"],
    );
  });
});
