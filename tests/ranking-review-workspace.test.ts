import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { RankingResult } from "@listing-photo-ranker/core/client";

import { RankingReviewWorkspace } from "../apps/web/components/ranking-review-workspace";
import { createTestGalleryFeedback, createTestPhotoCriteria } from "./helpers";

const RESULT: RankingResult = {
  ordered_images: [
    {
      image_id: "sync_1",
      position: 1,
      file_name: "front.png",
      overall_score: 0.91,
      hero_score: 0.95,
      technical_quality_score: 0.86,
      predicted_view_type: "front_exterior",
      view_tags: ["greenery"],
      criteria: createTestPhotoCriteria(),
      issues: [],
      improvement_actions: [],
      confidence: 0.84,
      rationale: "Strong exterior lead."
    }
  ],
  diagnostics: {
    duplicate_groups: [],
    missing_coverage: [],
    source_asset_count: 1,
    selected_asset_count: 1
  },
  gallery_feedback: createTestGalleryFeedback({
    actionable_items: [
      {
        title: "Open blinds before retaking interiors",
        priority: "high",
        why: "The current selection needs brighter room coverage.",
        how_to_fix: "Retake rooms with blinds open and lights on.",
        affected_image_ids: ["sync_1"]
      }
    ]
  }),
  method: "llm_judge" as const,
  provider_name: "heuristic-llm-judge",
  model_version: "gpt-5.4",
  feedback_allowed: true
};

test("ranking review workspace renders stateless export workflow", () => {
  const html = renderToStaticMarkup(
    createElement(RankingReviewWorkspace, {
      result: RESULT,
      headerMeta: "llm_judge · stateless · completed",
      subtitle: "Edit labels and sequence, then export the feedback JSON locally.",
      feedbackActionLabel: "Export feedback JSON",
      feedbackPendingLabel: "Preparing export...",
      idleFeedbackMessage: "Ready to export feedback JSON",
      previewUrlByImageId: { sync_1: "blob:front" },
      onSubmitFeedback: async () => "Feedback JSON downloaded."
    })
  );

  assert.match(html, /Export feedback JSON/);
  assert.match(html, /blob:front/);
  assert.match(html, /Ready to export feedback JSON/);
  assert.match(html, /Action plan/);
  assert.match(html, /Retake Advice/);
  assert.match(html, /Open blinds before retaking interiors/);
});
