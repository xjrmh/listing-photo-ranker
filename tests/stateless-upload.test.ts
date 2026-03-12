import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStatelessPayloadTooLargeMessage,
  estimateStatelessUploadPayloadBytes,
  needsStatelessUploadOptimization
} from "../apps/web/lib/stateless-upload";

test("multipart payload estimator includes overhead beyond raw file bytes", () => {
  const file = new File([new Uint8Array(128_000)], "front-exterior.jpg", { type: "image/jpeg" });

  const estimated = estimateStatelessUploadPayloadBytes([file]);

  assert.ok(estimated > file.size);
});

test("stateless upload optimizer flags payloads that exceed the safe budget", () => {
  const files = [
    new File([new Uint8Array(2_200_000)], "front.jpg", { type: "image/jpeg" }),
    new File([new Uint8Array(2_100_000)], "kitchen.jpg", { type: "image/jpeg" })
  ];

  assert.equal(needsStatelessUploadOptimization(files), true);
});

test("too-large stateless upload message explains the Vercel body limit", () => {
  const message = buildStatelessPayloadTooLargeMessage(4_250_000);

  assert.match(message, /4\.5 MB/);
  assert.match(message, /stateful mode/i);
});
