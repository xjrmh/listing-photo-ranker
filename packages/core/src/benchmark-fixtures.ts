import type { FeedbackRecord, ListingContext, RankingBenchmarkFixture } from "./schemas";
import { RankingBenchmarkFixtureSchema } from "./schemas";

export function createBenchmarkFixtureFromFeedback(input: {
  fixtureId: string;
  feedback: FeedbackRecord;
  listingContext?: ListingContext;
}): RankingBenchmarkFixture {
  return RankingBenchmarkFixtureSchema.parse({
    fixture_id: input.fixtureId,
    ranking_id: input.feedback.ranking_id,
    listing_context: input.listingContext ?? {
      listing_intent: "sale",
      property_type: "other"
    },
    expected_ordered_asset_ids: input.feedback.ordered_asset_ids,
    corrected_labels: input.feedback.corrected_labels,
    notes: input.feedback.notes
  });
}
