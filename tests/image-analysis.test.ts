import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { analyzeImageBuffer } from "@listing-photo-ranker/core";

test("analyzeImageBuffer decodes webp fixtures", async () => {
  const fixture = new URL(
    "../sample input photos/sample 2/21fe67041e6ef6b50ef2403d399fd4bf-uncropped_scaled_within_1536_1152.webp",
    import.meta.url
  );
  const bytes = await readFile(fixture);

  const analysis = await analyzeImageBuffer(bytes);

  assert.equal(analysis.width, 1024);
  assert.equal(analysis.height, 684);
  assert.equal(analysis.perceptualHash.length, 64);
  assert.ok(analysis.brightness >= 0 && analysis.brightness <= 1);
});
