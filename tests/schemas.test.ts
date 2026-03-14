import test from "node:test";
import assert from "node:assert/strict";

import {
  CreateRankingRequestSchema,
  FeedbackRequestSchema,
  RankingResultSchema,
  RankedPhotoSchema,
  ViewTypeSchema
} from "@listing-photo-ranker/core";
import { createTestGalleryFeedback, createTestPhotoCriteria } from "./helpers";

test("ranked photo schema enforces predicted view type and tag limits", () => {
  const parsed = RankedPhotoSchema.parse({
    image_id: "asset_1",
    position: 1,
    file_name: "front.jpg",
    overall_score: 0.8,
    hero_score: 0.9,
    technical_quality_score: 0.7,
    predicted_view_type: "front_exterior",
    view_tags: ["greenery"],
    criteria: createTestPhotoCriteria(),
    issues: [],
    improvement_actions: [],
    confidence: 0.85,
    rationale: "Strong hero."
  });

  assert.equal(parsed.predicted_view_type, "front_exterior");
});

test("feedback schema rejects empty ordered asset lists", () => {
  assert.throws(() => FeedbackRequestSchema.parse({ ordered_asset_ids: [], corrected_labels: [] }));
});

test("view type schema includes pool and bathroom", () => {
  assert.equal(ViewTypeSchema.parse("pool"), "pool");
  assert.equal(ViewTypeSchema.parse("bathroom"), "bathroom");
});

test("ranking request schema defaults listing context for backward compatibility", () => {
  const parsed = CreateRankingRequestSchema.parse({
    method: "cv",
    target_count: 2,
    asset_ids: ["asset_1", "asset_2"]
  });

  assert.deepEqual(parsed.listing_context, {
    listing_intent: "sale",
    property_type: "other"
  });
});

test("ranking result schema requires gallery feedback", () => {
  const parsed = RankingResultSchema.parse({
    ordered_images: [
      {
        image_id: "asset_1",
        position: 1,
        file_name: "front.jpg",
        overall_score: 0.8,
        hero_score: 0.9,
        technical_quality_score: 0.7,
        predicted_view_type: "front_exterior",
        view_tags: ["greenery"],
        criteria: createTestPhotoCriteria(),
        issues: [],
        improvement_actions: [],
        confidence: 0.85,
        rationale: "Strong hero."
      }
    ],
    diagnostics: {
      duplicate_groups: [],
      missing_coverage: [],
      source_asset_count: 1,
      selected_asset_count: 1
    },
    gallery_feedback: createTestGalleryFeedback(),
    method: "llm_judge",
    provider_name: "openai-llm-judge",
    model_version: "gpt-5.4",
    feedback_allowed: true
  });

  assert.equal(parsed.gallery_feedback.summary.length > 0, true);
});
