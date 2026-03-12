import test from "node:test";
import assert from "node:assert/strict";

import { buildWebRankingRequest } from "../apps/web/lib/ranking-request";

test("web rank request preserves property type and advanced policy toggles", () => {
  const request = buildWebRankingRequest({
    method: "llm_judge",
    targetCount: 4,
    assetIds: ["asset_1", "asset_2", "asset_3", "asset_4"],
    propertyType: "townhouse",
    policy: {
      preferExteriorHero: false,
      dedupe: true,
      requireRoomDiversity: false
    }
  });

  assert.deepEqual(request.listing_context, {
    listing_intent: "sale",
    property_type: "townhouse"
  });
  assert.deepEqual(request.policy, {
    prefer_exterior_hero: false,
    dedupe: true,
    require_room_diversity: false
  });
});
