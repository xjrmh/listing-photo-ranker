import test from "node:test";
import assert from "node:assert/strict";

import {
  HeuristicCvProvider,
  HeuristicLlmJudgeProvider,
  InlineJobScheduler,
  LocalStorageAdapter,
  MemoryRepository,
  createApp
} from "@listing-photo-ranker/core";

import { createSolidImageBuffer, waitFor } from "./helpers";

test("async app flow creates uploads, processes a ranking, and records feedback", async () => {
  const repository = new MemoryRepository();
  const storage = new LocalStorageAdapter();

  let app: ReturnType<typeof createApp>;
  const scheduler = new InlineJobScheduler(async (rankingId) => {
    await app.processRankingJob(rankingId);
  });

  app = createApp({
    repository,
    storage,
    scheduler,
    llmProvider: new HeuristicLlmJudgeProvider(),
    cvProvider: new HeuristicCvProvider()
  });

  const uploads = await app.createUploadSession(
    {
      files: [
        { file_name: "front-exterior.jpg", content_type: "image/png" },
        { file_name: "kitchen.jpg", content_type: "image/png" },
        { file_name: "bathroom.jpg", content_type: "image/png" }
      ]
    },
    { baseUrl: "http://127.0.0.1:3000" }
  );

  const front = await createSolidImageBuffer({ r: 120, g: 170, b: 120 }, { width: 112, height: 72, striped: true });
  const kitchen = await createSolidImageBuffer({ r: 188, g: 165, b: 140 }, { striped: true });
  const bath = await createSolidImageBuffer({ r: 220, g: 220, b: 228 });

  await app.putUploadedAsset(uploads.files[0].asset_id, new URL(uploads.files[0].upload_url).searchParams.get("token")!, front, "image/png");
  await app.putUploadedAsset(uploads.files[1].asset_id, new URL(uploads.files[1].upload_url).searchParams.get("token")!, kitchen, "image/png");
  await app.putUploadedAsset(uploads.files[2].asset_id, new URL(uploads.files[2].upload_url).searchParams.get("token")!, bath, "image/png");

  const ranking = await app.createRankingJob({
    method: "llm_judge",
    target_count: 3,
    asset_ids: uploads.files.map((file) => file.asset_id),
    listing_context: {
      listing_intent: "sale",
      property_type: "single_family"
    },
    policy: {
      prefer_exterior_hero: true,
      dedupe: true,
      require_room_diversity: true
    }
  });

  await waitFor(async () => {
    const latest = await app.getRankingJob(ranking.ranking_id, { baseUrl: "http://127.0.0.1:3000" });
    return latest?.status === "completed";
  });

  const completed = await app.getRankingJob(ranking.ranking_id, { baseUrl: "http://127.0.0.1:3000" });
  assert.equal(completed?.status, "completed");
  assert.ok(completed?.result);
  assert.equal(completed?.result?.ordered_images[0]?.predicted_view_type, "front_exterior");

  const feedback = await app.submitFeedback(ranking.ranking_id, {
    ordered_asset_ids: completed!.result!.ordered_images.map((image) => image.image_id).reverse(),
    corrected_labels: completed!.result!.ordered_images.map((image) => ({
      image_id: image.image_id,
      predicted_view_type: image.predicted_view_type,
      view_tags: image.view_tags
    })),
    notes: "Moved the bathroom later.",
    exported: true
  });

  assert.equal(feedback.ranking_id, ranking.ranking_id);
  assert.equal(feedback.exported, true);
});
