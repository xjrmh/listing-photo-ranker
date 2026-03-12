import test from "node:test";
import assert from "node:assert/strict";

import { createBenchmarkFixtureFromFeedback } from "@listing-photo-ranker/core";

test("benchmark fixtures can be derived deterministically from feedback records", () => {
  const fixture = createBenchmarkFixtureFromFeedback({
    fixtureId: "fixture_demo",
    feedback: {
      feedback_id: "fb_1",
      ranking_id: "rank_1",
      ordered_asset_ids: ["asset_2", "asset_1"],
      corrected_labels: [
        {
          image_id: "asset_2",
          predicted_view_type: "living_room",
          view_tags: ["staged"]
        }
      ],
      notes: "Accepted after swapping the lead image.",
      exported: true,
      created_at: new Date().toISOString()
    },
    listingContext: {
      listing_intent: "sale",
      property_type: "single_family"
    }
  });

  assert.equal(fixture.fixture_id, "fixture_demo");
  assert.deepEqual(fixture.expected_ordered_asset_ids, ["asset_2", "asset_1"]);
  assert.equal(fixture.listing_context.property_type, "single_family");
});
