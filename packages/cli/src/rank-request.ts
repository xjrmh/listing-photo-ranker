import { CreateRankingRequestSchema, type CreateRankingRequest, type PropertyType } from "@listing-photo-ranker/core";

export function buildCliRankingRequest(input: {
  method: "llm_judge" | "cv";
  targetCount: number;
  assetIds: string[];
  propertyType?: PropertyType;
}): CreateRankingRequest {
  return CreateRankingRequestSchema.parse({
    method: input.method,
    target_count: input.targetCount,
    asset_ids: input.assetIds,
    listing_context: {
      listing_intent: "sale",
      property_type: input.propertyType ?? "other"
    },
    policy: {
      prefer_exterior_hero: true,
      dedupe: true,
      require_room_diversity: true
    }
  });
}
