import test from "node:test";
import assert from "node:assert/strict";

import { OpenAiLlmJudgeProvider } from "@listing-photo-ranker/core";

import { createSolidImageBuffer, createTestPhotoCriteria } from "./helpers";

function createAsset(assetId: string, fileName: string, bytes: Buffer) {
  return {
    asset_id: assetId,
    file_name: fileName,
    content_type: "image/png",
    byte_size: bytes.byteLength,
    storage_key: `test/${fileName}`,
    upload_token: "token",
    upload_status: "uploaded" as const,
    created_at: new Date().toISOString(),
    uploaded_at: new Date().toISOString()
  };
}

test("openai llm judge maps structured output into provider assessments and gallery feedback", async () => {
  const bytes = await createSolidImageBuffer({ r: 120, g: 170, b: 120 }, { width: 112, height: 72, striped: true });
  const provider = new OpenAiLlmJudgeProvider({
    client: {
      async createResponse() {
        return {
          output_text: JSON.stringify({
            photos: [
              {
                asset_id: "asset_1",
                predicted_view_type: "front exterior",
                view_tags: ["greenery", "twilight"],
                scene_confidence: 0.91,
                overall_score: 0.89,
                hero_score: 0.95,
                technical_quality_score: 0.84,
                criteria: createTestPhotoCriteria({
                  perspective_straightness: 0.62,
                  declutter_staging: 0.45
                }),
                issues: ["tilted verticals", "clutter", "tv"],
                improvement_actions: [
                  {
                    issue: "tv",
                    priority: "medium",
                    action: "Turn off the TV before retaking the room."
                  }
                ],
                rationale: "Strong lead image with a few distractions."
              }
            ],
            gallery_feedback: {
              summary: "The gallery has a strong exterior lead but still needs cleaner staging.",
              strengths: ["The lead image has clear curb appeal."],
              weaknesses: ["A few frames still have staging distractions."],
              actionable_items: [
                {
                  title: "Retake cluttered images",
                  priority: "high",
                  why: "Distracting objects are weakening the overall polish.",
                  how_to_fix: "Clear surfaces and turn off TVs before retaking the affected rooms.",
                  affected_image_ids: ["asset_1"]
                }
              ]
            }
          })
        };
      }
    }
  });

  const analysis = await provider.analyze(
    [{ asset: createAsset("asset_1", "front.jpg", bytes), bytes }],
    { listingContext: { listing_intent: "sale", property_type: "single_family" } }
  );

  assert.equal(analysis.assessments.length, 1);
  assert.equal(analysis.assessments[0]?.predictedViewType, "front_exterior");
  assert.ok(analysis.assessments[0]?.issues.includes("possible_perspective_distortion"));
  assert.ok(analysis.assessments[0]?.issues.includes("clutter_or_personal_items"));
  assert.ok(analysis.assessments[0]?.issues.includes("screen_or_ceiling_fan_distraction"));
  assert.ok(
    analysis.assessments[0]?.improvementActions.some((action) => action.issue === "screen_or_ceiling_fan_distraction")
  );
  assert.equal(analysis.galleryFeedback?.actionable_items[0]?.affected_image_ids[0], "asset_1");
});

test("openai llm judge retries invalid json once and then fails", async () => {
  const bytes = await createSolidImageBuffer({ r: 120, g: 170, b: 120 }, { width: 112, height: 72, striped: true });
  let calls = 0;
  const provider = new OpenAiLlmJudgeProvider({
    client: {
      async createResponse() {
        calls += 1;
        return {
          output_text: "not valid json"
        };
      }
    }
  });

  await assert.rejects(
    () =>
      provider.analyze(
        [{ asset: createAsset("asset_1", "front.jpg", bytes), bytes }],
        { listingContext: { listing_intent: "sale", property_type: "single_family" } }
      ),
    /Unable to parse OpenAI LLM judge output|Unexpected token/
  );
  assert.equal(calls, 2);
});

test("openai llm judge falls back to API_KEY from the environment", async () => {
  const previousApiKey = process.env.API_KEY;
  const previousOpenAiApiKey = process.env.OPENAI_API_KEY;
  process.env.API_KEY = "test-fallback-key";
  delete process.env.OPENAI_API_KEY;

  try {
    let seenAuthorization = "";
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async (_input, init) => {
      seenAuthorization = new Headers(init?.headers).get("authorization") ?? "";
      return new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            photos: [
              {
                asset_id: "asset_1",
                predicted_view_type: "front exterior",
                view_tags: [],
                scene_confidence: 0.9,
                overall_score: 0.9,
                hero_score: 0.9,
                technical_quality_score: 0.8,
                criteria: createTestPhotoCriteria(),
                issues: [],
                improvement_actions: [],
                rationale: "Strong lead image."
              }
            ],
            gallery_feedback: {
              summary: "Good lead image.",
              strengths: ["Clean lead shot."],
              weaknesses: [],
              actionable_items: []
            }
          })
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    };

    try {
      const bytes = await createSolidImageBuffer({ r: 120, g: 170, b: 120 }, { width: 112, height: 72, striped: true });
      const provider = new OpenAiLlmJudgeProvider();
      const analysis = await provider.analyze(
        [{ asset: createAsset("asset_1", "front.jpg", bytes), bytes }],
        { listingContext: { listing_intent: "sale", property_type: "single_family" } }
      );

      assert.equal(analysis.assessments.length, 1);
      assert.equal(seenAuthorization, "Bearer test-fallback-key");
    } finally {
      globalThis.fetch = previousFetch;
    }
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.API_KEY;
    } else {
      process.env.API_KEY = previousApiKey;
    }
    if (previousOpenAiApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousOpenAiApiKey;
    }
  }
});

test("openai llm judge fails clearly when API_KEY and OPENAI_API_KEY are missing", async () => {
  const bytes = await createSolidImageBuffer({ r: 120, g: 170, b: 120 }, { width: 112, height: 72, striped: true });
  const provider = new OpenAiLlmJudgeProvider({
    apiKey: ""
  });

  await assert.rejects(
    () =>
      provider.analyze(
        [{ asset: createAsset("asset_1", "front.jpg", bytes), bytes }],
        { listingContext: { listing_intent: "sale", property_type: "single_family" } }
      ),
    /API_KEY is required/
  );
});
