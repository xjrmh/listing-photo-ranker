import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { RankingResult } from "@listing-photo-ranker/core/client";

import { StatelessResultsClient } from "../apps/web/components/stateless-results-client";
import {
  clearStatelessRankingSession,
  getStatelessRankingSession,
  setStatelessRankingSession
} from "../apps/web/lib/stateless-ranking-session";

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
      issues: [],
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
  method: "llm_judge" as const,
  provider_name: "heuristic-llm-judge",
  model_version: "gpt-5.4",
  feedback_allowed: true
};

afterEach(() => {
  clearStatelessRankingSession();
});

test("stateless ranking session stores files and result for the results page", () => {
  const file = new File(["front"], "front.png", { type: "image/png" });

  setStatelessRankingSession([file], RESULT);

  const session = getStatelessRankingSession();
  assert.ok(session);
  assert.equal(session?.files[0]?.name, "front.png");
  assert.equal(session?.result.method, "llm_judge");
});

test("stateless results client renders a rerun message when no session is available", () => {
  const html = renderToStaticMarkup(createElement(StatelessResultsClient));

  assert.match(html, /Stateless result unavailable/);
  assert.match(html, /run the ranking again/i);
});

test("stateless results client renders the review workspace when session is available", () => {
  setStatelessRankingSession([new File(["front"], "front.png", { type: "image/png" })], RESULT);

  const html = renderToStaticMarkup(createElement(StatelessResultsClient));

  assert.match(html, /Review ranked gallery/);
  assert.match(html, /Export feedback JSON/);
  assert.match(html, /New ranking/);
});
