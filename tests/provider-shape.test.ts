import test from "node:test";
import assert from "node:assert/strict";

import { HeuristicCvProvider, HeuristicLlmJudgeProvider } from "@listing-photo-ranker/core";

import { createSolidImageBuffer } from "./helpers";

test("cv and llm providers produce the same result shape", async () => {
  const bytes = await createSolidImageBuffer({ r: 80, g: 160, b: 90 }, { striped: true });
  const asset = {
    asset_id: "asset_1",
    file_name: "garden-view.jpg",
    content_type: "image/png",
    byte_size: bytes.byteLength,
    storage_key: "test/garden-view.jpg",
    upload_token: "token",
    upload_status: "uploaded" as const,
    created_at: new Date().toISOString(),
    uploaded_at: new Date().toISOString()
  };

  const cvAnalysis = await new HeuristicCvProvider().analyze([{ asset, bytes }], {
    listingContext: { listing_intent: "sale", property_type: "other" }
  });
  const llmAnalysis = await new HeuristicLlmJudgeProvider().analyze([{ asset, bytes }], {
    listingContext: { listing_intent: "sale", property_type: "other" }
  });
  const cvResult = cvAnalysis.assessments[0]!;
  const llmResult = llmAnalysis.assessments[0]!;

  assert.deepEqual(Object.keys(cvResult).sort(), Object.keys(llmResult).sort());
  assert.equal(cvResult.predictedViewType, "garden");
});

test("llm judge defaults to gpt-5.4", async () => {
  const bytes = await createSolidImageBuffer({ r: 90, g: 120, b: 170 }, { striped: true });
  const asset = {
    asset_id: "asset_2",
    file_name: "living-room.jpg",
    content_type: "image/png",
    byte_size: bytes.byteLength,
    storage_key: "test/living-room.jpg",
    upload_token: "token",
    upload_status: "uploaded" as const,
    created_at: new Date().toISOString(),
    uploaded_at: new Date().toISOString()
  };

  const analysis = await new HeuristicLlmJudgeProvider().analyze([{ asset, bytes }], {
    listingContext: { listing_intent: "sale", property_type: "other" }
  });
  const result = analysis.assessments[0]!;
  assert.equal(result.modelVersion, "gpt-5.4");
});

test("technical quality rewards landscape-balanced images over portrait utility framing", async () => {
  const landscape = await createSolidImageBuffer({ r: 120, g: 170, b: 120 }, { width: 112, height: 72, striped: true });
  const portrait = await createSolidImageBuffer({ r: 120, g: 170, b: 120 }, { width: 72, height: 112, striped: true });

  const landscapeAsset = {
    asset_id: "asset_landscape",
    file_name: "front-exterior.jpg",
    content_type: "image/png",
    byte_size: landscape.byteLength,
    storage_key: "test/front-exterior.jpg",
    upload_token: "token",
    upload_status: "uploaded" as const,
    created_at: new Date().toISOString(),
    uploaded_at: new Date().toISOString()
  };
  const portraitAsset = {
    ...landscapeAsset,
    asset_id: "asset_portrait",
    file_name: "portrait-front.jpg",
    byte_size: portrait.byteLength,
    storage_key: "test/portrait-front.jpg"
  };

  const landscapeResult = (
    await new HeuristicCvProvider().analyze([{ asset: landscapeAsset, bytes: landscape }], {
      listingContext: { listing_intent: "sale", property_type: "other" }
    })
  ).assessments[0]!;
  const portraitResult = (
    await new HeuristicCvProvider().analyze([{ asset: portraitAsset, bytes: portrait }], {
      listingContext: { listing_intent: "sale", property_type: "other" }
    })
  ).assessments[0]!;

  assert.ok(landscapeResult.technicalQualityScore > portraitResult.technicalQualityScore);
});

test("scene confidence is lower when the provider falls back to visual heuristics", async () => {
  const bytes = await createSolidImageBuffer({ r: 80, g: 160, b: 90 }, { striped: true });
  const explicitAsset = {
    asset_id: "asset_explicit",
    file_name: "living-room.jpg",
    content_type: "image/png",
    byte_size: bytes.byteLength,
    storage_key: "test/living-room.jpg",
    upload_token: "token",
    upload_status: "uploaded" as const,
    created_at: new Date().toISOString(),
    uploaded_at: new Date().toISOString()
  };
  const fallbackAsset = {
    ...explicitAsset,
    asset_id: "asset_fallback",
    file_name: "unknown-shot.jpg",
    storage_key: "test/unknown-shot.jpg"
  };

  const provider = new HeuristicCvProvider();
  const explicitResult = (
    await provider.analyze([{ asset: explicitAsset, bytes }], {
      listingContext: { listing_intent: "sale", property_type: "other" }
    })
  ).assessments[0]!;
  const fallbackResult = (
    await provider.analyze([{ asset: fallbackAsset, bytes }], {
      listingContext: { listing_intent: "sale", property_type: "other" }
    })
  ).assessments[0]!;

  assert.ok(explicitResult.sceneConfidence > fallbackResult.sceneConfidence);
});
