import test from "node:test";
import assert from "node:assert/strict";

import { buildCliRankingRequest, buildCliSyncRankingOptions } from "../packages/cli/src/rank-request";

test("cli rank request attaches sale listing context with selected property type", () => {
  const request = buildCliRankingRequest({
    method: "cv",
    targetCount: 3,
    assetIds: ["asset_1", "asset_2", "asset_3"],
    propertyType: "condo"
  });

  assert.deepEqual(request.listing_context, {
    listing_intent: "sale",
    property_type: "condo"
  });
});

test("cli sync ranking options attach sale listing context with selected property type", () => {
  const request = buildCliSyncRankingOptions({
    method: "cv",
    targetCount: 2,
    propertyType: "single_family"
  });

  assert.deepEqual(request, {
    method: "cv",
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
  });
});
