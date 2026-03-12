import test from "node:test";
import assert from "node:assert/strict";

import { buildCliRankingRequest } from "../packages/cli/src/rank-request";

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
