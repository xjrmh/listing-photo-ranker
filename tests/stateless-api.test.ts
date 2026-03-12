import test from "node:test";
import assert from "node:assert/strict";

import { POST as createRankingPost } from "../apps/web/app/api/v1/rankings/route";
import { POST as createSyncRankingPost } from "../apps/web/app/api/v1/rankings/sync/route";
import { POST as createUploadPost } from "../apps/web/app/api/v1/uploads/route";
import { GET as getRankingById } from "../apps/web/app/api/v1/rankings/[id]/route";
import { POST as submitFeedbackPost } from "../apps/web/app/api/v1/rankings/[id]/feedback/route";
import { createSolidImageBuffer } from "./helpers";

function resetServerGlobals() {
  delete (globalThis as typeof globalThis & { __listingPhotoRankerApp__?: unknown }).__listingPhotoRankerApp__;
  delete (globalThis as typeof globalThis & { __listingPhotoRankerRepoState__?: unknown }).__listingPhotoRankerRepoState__;
  delete (globalThis as typeof globalThis & { __listingPhotoRankerObjects__?: unknown }).__listingPhotoRankerObjects__;
}

function env(values: Partial<NodeJS.ProcessEnv>): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    ...values
  } as NodeJS.ProcessEnv;
}

async function withEnv<T>(values: NodeJS.ProcessEnv, callback: () => Promise<T>): Promise<T> {
  const previous = { ...process.env };
  resetServerGlobals();
  Object.assign(process.env, values);

  try {
    return await callback();
  } finally {
    resetServerGlobals();
    for (const key of Object.keys(process.env)) {
      if (!(key in previous)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, previous);
  }
}

test("sync ranking endpoint accepts multipart uploads in stateless mode", async () => {
  await withEnv(env({ APP_RUNTIME_MODE: "stateless" }), async () => {
    const front = await createSolidImageBuffer({ r: 120, g: 170, b: 120 }, { width: 112, height: 72, striped: true });
    const kitchen = await createSolidImageBuffer({ r: 188, g: 165, b: 140 }, { striped: true });
    const formData = new FormData();
    formData.append("files", new File([new Uint8Array(front)], "front-exterior.png", { type: "image/png" }));
    formData.append("files", new File([new Uint8Array(kitchen)], "kitchen.png", { type: "image/png" }));
    formData.append("method", "llm_judge");
    formData.append("target_count", "2");
    formData.append("property_type", "single_family");

    const response = await createSyncRankingPost(
      new Request("http://127.0.0.1:3000/api/v1/rankings/sync", {
        method: "POST",
        body: formData
      })
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ordered_images.length, 2);
    assert.equal(payload.ordered_images[0].image_id, "sync_1");
  });
});

test("sync ranking endpoint rejects empty multipart payloads", async () => {
  await withEnv(env({ APP_RUNTIME_MODE: "stateless" }), async () => {
    const response = await createSyncRankingPost(
      new Request("http://127.0.0.1:3000/api/v1/rankings/sync", {
        method: "POST",
        body: new FormData()
      })
    );

    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.match(payload.error, /too small/i);
  });
});

test("async upload and ranking endpoints fail fast in stateless mode", async () => {
  await withEnv(env({ APP_RUNTIME_MODE: "stateless" }), async () => {
    const uploadResponse = await createUploadPost(
      new Request("http://127.0.0.1:3000/api/v1/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          files: [{ file_name: "front.png", content_type: "image/png", size_bytes: 10 }]
        })
      })
    );
    assert.equal(uploadResponse.status, 409);

    const rankingResponse = await createRankingPost(
      new Request("http://127.0.0.1:3000/api/v1/rankings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          method: "llm_judge",
          target_count: 1,
          asset_ids: ["asset_1"],
          listing_context: { listing_intent: "sale", property_type: "other" },
          policy: { prefer_exterior_hero: true, dedupe: true, require_room_diversity: true }
        })
      })
    );
    assert.equal(rankingResponse.status, 409);
  });
});

test("async read and feedback endpoints fail fast in stateless mode", async () => {
  await withEnv(env({ APP_RUNTIME_MODE: "stateless" }), async () => {
    const getResponse = await getRankingById(
      new Request("http://127.0.0.1:3000/api/v1/rankings/rank_1"),
      { params: Promise.resolve({ id: "rank_1" }) }
    );
    assert.equal(getResponse.status, 409);

    const feedbackResponse = await submitFeedbackPost(
      new Request("http://127.0.0.1:3000/api/v1/rankings/rank_1/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ordered_asset_ids: ["sync_1"],
          corrected_labels: [],
          exported: false
        })
      }),
      { params: Promise.resolve({ id: "rank_1" }) }
    );
    assert.equal(feedbackResponse.status, 409);
  });
});
