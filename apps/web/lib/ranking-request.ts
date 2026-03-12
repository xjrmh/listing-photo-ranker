import { CreateRankingRequestSchema, type CreateRankingRequest, type PropertyType } from "@listing-photo-ranker/core/schemas";

export function buildWebRankingRequest(input: {
  method: "llm_judge" | "cv";
  targetCount: number;
  assetIds: string[];
  propertyType: PropertyType;
  policy: {
    preferExteriorHero: boolean;
    dedupe: boolean;
    requireRoomDiversity: boolean;
  };
}): CreateRankingRequest {
  return CreateRankingRequestSchema.parse({
    method: input.method,
    target_count: input.targetCount,
    asset_ids: input.assetIds,
    listing_context: {
      listing_intent: "sale",
      property_type: input.propertyType
    },
    policy: {
      prefer_exterior_hero: input.policy.preferExteriorHero,
      dedupe: input.policy.dedupe,
      require_room_diversity: input.policy.requireRoomDiversity
    }
  });
}
