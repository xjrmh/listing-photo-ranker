import test from "node:test";
import assert from "node:assert/strict";

import { buildRankingResult, type ProviderAssessment } from "@listing-photo-ranker/core";
import { createTestImprovementActions, createTestPhotoCriteria } from "./helpers";

function assessment(overrides: Partial<ProviderAssessment>): ProviderAssessment {
  return {
    assetId: overrides.assetId ?? crypto.randomUUID(),
    fileName: overrides.fileName ?? "photo.jpg",
    method: overrides.method ?? "cv",
    providerName: "test-provider",
    modelVersion: "test-v1",
    overallScore: overrides.overallScore ?? 0.6,
    heroScore: overrides.heroScore ?? 0.6,
    technicalQualityScore: overrides.technicalQualityScore ?? 0.6,
    predictedViewType: overrides.predictedViewType ?? "other",
    viewTags: overrides.viewTags ?? [],
    criteria: overrides.criteria ?? createTestPhotoCriteria(),
    sceneConfidence: overrides.sceneConfidence ?? 0.8,
    issues: overrides.issues ?? [],
    improvementActions: overrides.improvementActions ?? createTestImprovementActions(),
    confidence: overrides.confidence ?? 0.7,
    rationale: overrides.rationale ?? "Test rationale",
    perceptualHash: overrides.perceptualHash ?? "1010101010101010"
  };
}

test("ranking prefers a strong exterior hero when configured", () => {
  const result = buildRankingResult({
    assessments: [
      assessment({ assetId: "kitchen", predictedViewType: "kitchen", overallScore: 0.82, heroScore: 0.72, perceptualHash: "1111000011110000" }),
      assessment({ assetId: "front", predictedViewType: "front_exterior", overallScore: 0.78, heroScore: 0.95, perceptualHash: "0000111100001111" })
    ],
    method: "cv",
    listingContext: {
      listing_intent: "sale",
      property_type: "single_family"
    },
    policy: {
      prefer_exterior_hero: true,
      dedupe: true,
      require_room_diversity: true
    },
    targetCount: 2,
    providerName: "test-provider",
    modelVersion: "test-v1"
  });

  assert.equal(result.ordered_images[0]?.image_id, "front");
});

test("ranking suppresses near duplicates when dedupe is enabled", () => {
  const result = buildRankingResult({
    assessments: [
      assessment({ assetId: "front_a", predictedViewType: "front_exterior", perceptualHash: "1010101010101010" }),
      assessment({ assetId: "front_b", predictedViewType: "front_exterior", perceptualHash: "1010101010101011" }),
      assessment({ assetId: "living", predictedViewType: "living_room", perceptualHash: "0000111100001111" })
    ],
    method: "cv",
    listingContext: {
      listing_intent: "sale",
      property_type: "single_family"
    },
    policy: {
      prefer_exterior_hero: true,
      dedupe: true,
      require_room_diversity: true
    },
    targetCount: 3,
    providerName: "test-provider",
    modelVersion: "test-v1"
  });

  assert.equal(result.ordered_images.length, 2);
  assert.equal(result.diagnostics.duplicate_groups.length, 1);
});

test("ranking falls back from a weak exterior when it misses the lead quality floor", () => {
  const result = buildRankingResult({
    assessments: [
      assessment({
        assetId: "front",
        predictedViewType: "front_exterior",
        overallScore: 0.88,
        heroScore: 0.97,
        technicalQualityScore: 0.42,
        perceptualHash: "0000111100001111"
      }),
      assessment({
        assetId: "living",
        predictedViewType: "living_room",
        overallScore: 0.84,
        heroScore: 0.8,
        technicalQualityScore: 0.81,
        perceptualHash: "1111000011110000"
      })
    ],
    method: "cv",
    listingContext: {
      listing_intent: "sale",
      property_type: "single_family"
    },
    policy: {
      prefer_exterior_hero: true,
      dedupe: true,
      require_room_diversity: true
    },
    targetCount: 2,
    providerName: "test-provider",
    modelVersion: "test-v1"
  });

  assert.equal(result.ordered_images[0]?.image_id, "living");
});

test("ranking uses condo-specific lead priorities", () => {
  const result = buildRankingResult({
    assessments: [
      assessment({
        assetId: "front",
        predictedViewType: "front_exterior",
        overallScore: 0.86,
        heroScore: 0.9,
        technicalQualityScore: 0.82,
        perceptualHash: "0000111100001111"
      }),
      assessment({
        assetId: "view",
        predictedViewType: "view",
        overallScore: 0.83,
        heroScore: 0.84,
        technicalQualityScore: 0.8,
        perceptualHash: "1111000011110000"
      })
    ],
    method: "cv",
    listingContext: {
      listing_intent: "sale",
      property_type: "condo"
    },
    policy: {
      prefer_exterior_hero: true,
      dedupe: true,
      require_room_diversity: true
    },
    targetCount: 2,
    providerName: "test-provider",
    modelVersion: "test-v1"
  });

  assert.equal(result.ordered_images[0]?.image_id, "view");
});

test("ranking keeps utility shots out of the first five when core coverage exists", () => {
  const result = buildRankingResult({
    assessments: [
      assessment({
        assetId: "front",
        predictedViewType: "front_exterior",
        overallScore: 0.8,
        heroScore: 0.92,
        perceptualHash: "0000000011111111000000001111111100000000111111110000000011111111"
      }),
      assessment({
        assetId: "living",
        predictedViewType: "living_room",
        overallScore: 0.83,
        heroScore: 0.8,
        perceptualHash: "1111111100000000111111110000000011111111000000001111111100000000"
      }),
      assessment({
        assetId: "kitchen",
        predictedViewType: "kitchen",
        overallScore: 0.82,
        heroScore: 0.81,
        perceptualHash: "0000111100001111000011110000111100001111000011110000111100001111"
      }),
      assessment({
        assetId: "primary",
        predictedViewType: "primary_bedroom",
        overallScore: 0.79,
        heroScore: 0.72,
        perceptualHash: "1111000011110000111100001111000011110000111100001111000011110000"
      }),
      assessment({
        assetId: "bath",
        predictedViewType: "bathroom",
        overallScore: 0.75,
        heroScore: 0.62,
        perceptualHash: "0011001100110011001100110011001100110011001100110011001100110011"
      }),
      assessment({
        assetId: "garage",
        predictedViewType: "garage",
        overallScore: 0.88,
        heroScore: 0.65,
        perceptualHash: "1100110011001100110011001100110011001100110011001100110011001100"
      }),
      assessment({
        assetId: "laundry",
        predictedViewType: "laundry",
        overallScore: 0.87,
        heroScore: 0.64,
        perceptualHash: "0101010101010101101010101010101001010101010101011010101010101010"
      })
    ],
    method: "cv",
    listingContext: {
      listing_intent: "sale",
      property_type: "single_family"
    },
    policy: {
      prefer_exterior_hero: true,
      dedupe: true,
      require_room_diversity: true
    },
    targetCount: 7,
    providerName: "test-provider",
    modelVersion: "test-v1"
  });

  const firstFive = result.ordered_images.slice(0, 5).map((image) => image.predicted_view_type);
  assert.equal(firstFive.includes("garage"), false);
  assert.equal(firstFive.includes("laundry"), false);
});

test("ranking avoids reusing the same duplicate cluster in the first five when dedupe is disabled", () => {
  const result = buildRankingResult({
    assessments: [
      assessment({ assetId: "front_a", predictedViewType: "front_exterior", overallScore: 0.86, heroScore: 0.94, perceptualHash: "1010101010101010" }),
      assessment({ assetId: "front_b", predictedViewType: "front_exterior", overallScore: 0.84, heroScore: 0.9, perceptualHash: "1010101010101011" }),
      assessment({ assetId: "living", predictedViewType: "living_room", overallScore: 0.82, heroScore: 0.8, perceptualHash: "0000111100001111" }),
      assessment({ assetId: "kitchen", predictedViewType: "kitchen", overallScore: 0.81, heroScore: 0.79, perceptualHash: "1111000011110000" }),
      assessment({ assetId: "primary", predictedViewType: "primary_bedroom", overallScore: 0.8, heroScore: 0.73, perceptualHash: "0011001100110011" }),
      assessment({ assetId: "bath", predictedViewType: "bathroom", overallScore: 0.74, heroScore: 0.62, perceptualHash: "1100110011001100" })
    ],
    method: "cv",
    listingContext: {
      listing_intent: "sale",
      property_type: "single_family"
    },
    policy: {
      prefer_exterior_hero: true,
      dedupe: false,
      require_room_diversity: true
    },
    targetCount: 5,
    providerName: "test-provider",
    modelVersion: "test-v1"
  });

  const firstFive = result.ordered_images.slice(0, 5).map((image) => image.image_id);
  const duplicateCount = firstFive.filter((imageId) => imageId === "front_a" || imageId === "front_b").length;
  assert.equal(duplicateCount, 1);
});

test("surfaced checkpoints favor varied sequence groups in longer galleries", () => {
  const result = buildRankingResult({
    assessments: [
      assessment({ assetId: "front", predictedViewType: "front_exterior", overallScore: 0.83, heroScore: 0.93, perceptualHash: "0000000000000000" }),
      assessment({ assetId: "living", predictedViewType: "living_room", overallScore: 0.88, heroScore: 0.88, perceptualHash: "0000111100001111" }),
      assessment({ assetId: "living_b", predictedViewType: "living_room", overallScore: 0.87, heroScore: 0.84, perceptualHash: "1111000011111111" }),
      assessment({ assetId: "kitchen", predictedViewType: "kitchen", overallScore: 0.86, heroScore: 0.83, perceptualHash: "1111000011110000" }),
      assessment({ assetId: "primary", predictedViewType: "primary_bedroom", overallScore: 0.82, heroScore: 0.74, perceptualHash: "0011001100110011" }),
      assessment({ assetId: "bath", predictedViewType: "bathroom", overallScore: 0.78, heroScore: 0.64, perceptualHash: "1100110011001100" }),
      assessment({ assetId: "view", predictedViewType: "view", overallScore: 0.8, heroScore: 0.82, perceptualHash: "0101010101010101" }),
      assessment({ assetId: "yard", predictedViewType: "yard", overallScore: 0.77, heroScore: 0.7, perceptualHash: "1010101010101010" }),
      assessment({ assetId: "office", predictedViewType: "office", overallScore: 0.72, heroScore: 0.58, perceptualHash: "0110011001100110" }),
      assessment({ assetId: "amenity", predictedViewType: "amenity", overallScore: 0.76, heroScore: 0.68, perceptualHash: "1001100110011001" })
    ],
    method: "cv",
    listingContext: {
      listing_intent: "sale",
      property_type: "single_family"
    },
    policy: {
      prefer_exterior_hero: true,
      dedupe: true,
      require_room_diversity: true
    },
    targetCount: 10,
    providerName: "test-provider",
    modelVersion: "test-v1"
  });

  const surfacedPositions = [1, 3, 4, 6, 8];
  const surfacedGroups = new Set(
    surfacedPositions.map((position) => result.ordered_images[position - 1]?.predicted_view_type).filter(Boolean)
  );

  assert.ok(surfacedGroups.size >= 4);
});
