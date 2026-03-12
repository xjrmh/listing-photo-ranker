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

import { createSolidImageBuffer } from "./helpers";

test("stateless rankFilesSync returns a complete ranking result without persisted state", async () => {
  const app = createApp({
    repository: new MemoryRepository(),
    storage: new LocalStorageAdapter(),
    scheduler: new InlineJobScheduler(async () => {}),
    llmProvider: new HeuristicLlmJudgeProvider(),
    cvProvider: new HeuristicCvProvider()
  });

  const front = await createSolidImageBuffer({ r: 120, g: 170, b: 120 }, { width: 112, height: 72, striped: true });
  const kitchen = await createSolidImageBuffer({ r: 188, g: 165, b: 140 }, { striped: true });
  const bath = await createSolidImageBuffer({ r: 220, g: 220, b: 228 });

  const ranking = await app.rankFilesSync(
    {
      method: "llm_judge",
      target_count: 2,
      listing_context: {
        listing_intent: "sale",
        property_type: "single_family"
      },
      policy: {
        prefer_exterior_hero: true,
        dedupe: true,
        require_room_diversity: true
      }
    },
    [
      { file_name: "front-exterior.png", content_type: "image/png", bytes: front },
      { file_name: "kitchen.png", content_type: "image/png", bytes: kitchen },
      { file_name: "bathroom.png", content_type: "image/png", bytes: bath }
    ]
  );

  assert.equal(ranking.ordered_images.length, 2);
  assert.equal(ranking.ordered_images[0]?.image_id, "sync_1");
  assert.equal(ranking.ordered_images[0]?.predicted_view_type, "front_exterior");
  assert.equal(ranking.diagnostics.source_asset_count, 3);
  assert.equal(ranking.diagnostics.selected_asset_count, 2);
  assert.equal(ranking.feedback_allowed, true);
});
