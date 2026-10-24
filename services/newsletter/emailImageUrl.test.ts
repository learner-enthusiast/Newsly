import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import { emailImageUrl } from "@/services/newsletter/newsletterRun";

const APP = "https://newsly.example/";

test("emailImageUrl keeps absolute http(s) URLs", () => {
  assert.equal(emailImageUrl("https://cdn.x/a.jpg", APP), "https://cdn.x/a.jpg");
  assert.equal(emailImageUrl("  http://cdn.x/a.jpg ", APP), "http://cdn.x/a.jpg");
});

test("emailImageUrl resolves app-relative paths against the app URL", () => {
  assert.equal(
    emailImageUrl("/api/cover/1", APP),
    "https://newsly.example/api/cover/1",
  );
});

test("emailImageUrl drops missing and unusable values", () => {
  assert.equal(emailImageUrl(null, APP), null);
  assert.equal(emailImageUrl("   ", APP), null);
  assert.equal(emailImageUrl("//cdn.x/a.jpg", APP), null);
  assert.equal(emailImageUrl("data:image/png;base64,AAA", APP), null);
  assert.equal(emailImageUrl("relative/a.jpg", APP), null);
});
