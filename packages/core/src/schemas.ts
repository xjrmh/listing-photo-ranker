import { z } from "zod";

import { VIEW_TYPES, ViewTypeSchema } from "./view-types";

export const RankingMethodSchema = z.enum(["llm_judge", "cv"]);
export type RankingMethod = z.infer<typeof RankingMethodSchema>;

export const ListingIntentSchema = z.enum(["sale"]);
export type ListingIntent = z.infer<typeof ListingIntentSchema>;

export const PropertyTypeSchema = z.enum(["single_family", "condo", "townhouse", "multi_family", "other"]);
export type PropertyType = z.infer<typeof PropertyTypeSchema>;

export const ListingContextSchema = z.object({
  listing_intent: ListingIntentSchema.default("sale"),
  property_type: PropertyTypeSchema.default("other")
});
export type ListingContext = z.infer<typeof ListingContextSchema>;

export const IssueSchema = z.enum([
  "underexposed",
  "overexposed",
  "blurry",
  "possible_perspective_distortion",
  "low_contrast",
  "duplicate_candidate"
]);

export const RankingPolicySchema = z.object({
  prefer_exterior_hero: z.boolean().default(true),
  dedupe: z.boolean().default(true),
  require_room_diversity: z.boolean().default(true)
});
export type RankingPolicy = z.infer<typeof RankingPolicySchema>;

export const UploadFileSchema = z.object({
  file_name: z.string().min(1),
  content_type: z.string().min(1),
  size_bytes: z.number().int().nonnegative().optional()
});

export const CreateUploadRequestSchema = z.object({
  files: z.array(UploadFileSchema).min(1).max(50)
});
export type CreateUploadRequest = z.infer<typeof CreateUploadRequestSchema>;

export const UploadTargetSchema = z.object({
  asset_id: z.string(),
  file_name: z.string(),
  content_type: z.string(),
  upload_url: z.string().url(),
  upload_method: z.literal("PUT"),
  headers: z.record(z.string(), z.string()),
  expires_at: z.string(),
  preview_url: z.string().url()
});

export const CreateUploadResponseSchema = z.object({
  files: z.array(UploadTargetSchema)
});
export type CreateUploadResponse = z.infer<typeof CreateUploadResponseSchema>;

export const RankedPhotoSchema = z.object({
  image_id: z.string(),
  position: z.number().int().positive(),
  file_name: z.string(),
  overall_score: z.number().min(0).max(1),
  hero_score: z.number().min(0).max(1),
  technical_quality_score: z.number().min(0).max(1),
  predicted_view_type: ViewTypeSchema,
  view_tags: z.array(z.string()).max(5),
  issues: z.array(IssueSchema),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  preview_url: z.string().url().optional()
});
export type RankedPhoto = z.infer<typeof RankedPhotoSchema>;

export const RankingDiagnosticsSchema = z.object({
  duplicate_groups: z.array(z.array(z.string()).min(2)),
  missing_coverage: z.array(z.enum(VIEW_TYPES)),
  source_asset_count: z.number().int().positive(),
  selected_asset_count: z.number().int().positive()
});

export const RankingResultSchema = z.object({
  ordered_images: z.array(RankedPhotoSchema),
  diagnostics: RankingDiagnosticsSchema,
  method: RankingMethodSchema,
  provider_name: z.string(),
  model_version: z.string(),
  feedback_allowed: z.boolean()
});
export type RankingResult = z.infer<typeof RankingResultSchema>;

export const CreateRankingRequestSchema = z.object({
  method: RankingMethodSchema,
  target_count: z.number().int().positive().max(50),
  asset_ids: z.array(z.string()).min(1).max(50),
  listing_context: ListingContextSchema.default({
    listing_intent: "sale",
    property_type: "other"
  }),
  policy: RankingPolicySchema.default({
    prefer_exterior_hero: true,
    dedupe: true,
    require_room_diversity: true
  })
});
export type CreateRankingRequest = z.input<typeof CreateRankingRequestSchema>;

export const CreateSyncRankingOptionsSchema = CreateRankingRequestSchema.omit({
  asset_ids: true
});
export type CreateSyncRankingOptions = z.input<typeof CreateSyncRankingOptionsSchema>;

export const RankingStatusSchema = z.enum(["pending", "processing", "completed", "failed"]);
export type RankingStatus = z.infer<typeof RankingStatusSchema>;

export const RankingJobSchema = z.object({
  ranking_id: z.string(),
  status: RankingStatusSchema,
  method: RankingMethodSchema,
  target_count: z.number().int().positive(),
  asset_ids: z.array(z.string()),
  listing_context: ListingContextSchema,
  policy: RankingPolicySchema,
  provider_name: z.string().nullable(),
  model_version: z.string().nullable(),
  error: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  result: RankingResultSchema.nullable()
});
export type RankingJob = z.infer<typeof RankingJobSchema>;

export const CorrectedLabelSchema = z.object({
  image_id: z.string(),
  predicted_view_type: ViewTypeSchema,
  view_tags: z.array(z.string()).max(5).default([])
});

export const FeedbackRequestSchema = z.object({
  ordered_asset_ids: z.array(z.string()).min(1),
  corrected_labels: z.array(CorrectedLabelSchema).default([]),
  notes: z.string().max(2000).optional(),
  exported: z.boolean().default(false)
});
export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;

export const FeedbackRecordSchema = z.object({
  feedback_id: z.string(),
  ranking_id: z.string(),
  ordered_asset_ids: z.array(z.string()),
  corrected_labels: z.array(CorrectedLabelSchema),
  notes: z.string().nullable(),
  exported: z.boolean(),
  created_at: z.string()
});
export type FeedbackRecord = z.infer<typeof FeedbackRecordSchema>;

export const AssetRecordSchema = z.object({
  asset_id: z.string(),
  file_name: z.string(),
  content_type: z.string(),
  byte_size: z.number().int().nonnegative().nullable(),
  storage_key: z.string(),
  upload_token: z.string(),
  upload_status: z.enum(["pending", "uploaded"]),
  created_at: z.string(),
  uploaded_at: z.string().nullable()
});
export type AssetRecord = z.infer<typeof AssetRecordSchema>;

export const RankingBenchmarkFixtureSchema = z.object({
  fixture_id: z.string(),
  ranking_id: z.string().optional(),
  listing_context: ListingContextSchema.default({
    listing_intent: "sale",
    property_type: "other"
  }),
  expected_ordered_asset_ids: z.array(z.string()).min(1),
  corrected_labels: z.array(CorrectedLabelSchema).default([]),
  notes: z.string().nullable().default(null)
});
export type RankingBenchmarkFixture = z.infer<typeof RankingBenchmarkFixtureSchema>;

export const UploadTargetInternalSchema = z.object({
  upload_url: z.string().url(),
  upload_method: z.literal("PUT"),
  headers: z.record(z.string(), z.string()),
  expires_at: z.string()
});
export type UploadTargetInternal = z.infer<typeof UploadTargetInternalSchema>;
