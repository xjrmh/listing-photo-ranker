import { Inngest } from "inngest";
import { Pool } from "pg";

import { buildDuplicateGroups, buildRankingResult } from "./ranking-policy";
import { HeuristicCvProvider, HeuristicLlmJudgeProvider, addDuplicateIssue, type RankingProvider } from "./providers";
import { MemoryRepository, PostgresRepository, type Repository } from "./repository";
import {
  AssetRecordSchema,
  CreateRankingRequestSchema,
  CreateUploadRequestSchema,
  FeedbackRecordSchema,
  FeedbackRequestSchema,
  RankingJobSchema,
  type AssetRecord,
  type CreateRankingRequest,
  type CreateUploadRequest,
  type CreateUploadResponse,
  type FeedbackRecord,
  type FeedbackRequest,
  type RankingJob
} from "./schemas";
import { InngestJobScheduler, InlineJobScheduler, type JobScheduler } from "./scheduler";
import { LocalStorageAdapter, S3StorageAdapter, type StorageAdapter } from "./storage";
import { createId, getBaseUrl, nowIso, safeFileName } from "./utils";
import { normalizeViewTags, normalizeViewType } from "./view-types";

export type AppServices = {
  createUploadSession(request: CreateUploadRequest, options?: { baseUrl?: string }): Promise<CreateUploadResponse>;
  putUploadedAsset(assetId: string, token: string, body: Buffer, contentType?: string): Promise<AssetRecord>;
  getAsset(assetId: string): Promise<AssetRecord | null>;
  getAssetContent(assetId: string): Promise<{ body: Buffer; contentType: string; fileName: string }>;
  createRankingJob(request: CreateRankingRequest): Promise<RankingJob>;
  getRankingJob(rankingId: string, options?: { baseUrl?: string }): Promise<RankingJob | null>;
  processRankingJob(rankingId: string): Promise<void>;
  submitFeedback(rankingId: string, request: FeedbackRequest): Promise<FeedbackRecord>;
  inngest?: Inngest;
};

type AppConfig = {
  repository: Repository;
  storage: StorageAdapter;
  scheduler: JobScheduler;
  llmProvider: RankingProvider;
  cvProvider: RankingProvider;
  inngest?: Inngest;
};

declare global {
  // eslint-disable-next-line no-var
  var __listingPhotoRankerApp__: AppServices | undefined;
}

function mapUploadResponse(asset: AssetRecord, upload: { upload_url: string; upload_method: "PUT"; headers: Record<string, string>; expires_at: string }, baseUrl?: string) {
  return {
    asset_id: asset.asset_id,
    file_name: asset.file_name,
    content_type: asset.content_type,
    upload_url: upload.upload_url,
    upload_method: upload.upload_method,
    headers: upload.headers,
    expires_at: upload.expires_at,
    preview_url: `${getBaseUrl(baseUrl)}/api/v1/uploads/${asset.asset_id}/content`
  };
}

function withPreviewUrls(ranking: RankingJob, baseUrl?: string): RankingJob {
  if (!ranking.result) {
    return ranking;
  }

  return {
    ...ranking,
    result: {
      ...ranking.result,
      ordered_images: ranking.result.ordered_images.map((image) => ({
        ...image,
        preview_url: `${getBaseUrl(baseUrl)}/api/v1/uploads/${image.image_id}/content`
      }))
    }
  };
}

export function createInngestClient(): Inngest {
  return new Inngest({
    id: "listing-photo-ranker"
  });
}

function createRepository(): Repository {
  if (process.env.DATABASE_URL) {
    return new PostgresRepository(new Pool({ connectionString: process.env.DATABASE_URL }));
  }
  return new MemoryRepository();
}

function createStorage(): StorageAdapter {
  if (process.env.STORAGE_PROVIDER === "s3" && process.env.S3_BUCKET) {
    return new S3StorageAdapter({
      bucket: process.env.S3_BUCKET,
      region: process.env.S3_REGION ?? "us-east-1",
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      endpoint: process.env.S3_ENDPOINT
    });
  }
  return new LocalStorageAdapter();
}

export function createApp(config: AppConfig): AppServices {
  return {
    async createUploadSession(request, options) {
      const parsed = CreateUploadRequestSchema.parse(request);
      const files = await Promise.all(
        parsed.files.map(async (file) => {
          const asset: AssetRecord = AssetRecordSchema.parse({
            asset_id: createId("asset"),
            file_name: file.file_name,
            content_type: file.content_type,
            byte_size: file.size_bytes ?? null,
            storage_key: `${createId("obj")}/${safeFileName(file.file_name)}`,
            upload_token: createId("upload"),
            upload_status: "pending",
            created_at: nowIso(),
            uploaded_at: null
          });

          const savedAsset = await config.repository.createAsset(asset);
          const upload = await config.storage.createUploadTarget(savedAsset, options);
          return mapUploadResponse(savedAsset, upload, options?.baseUrl);
        })
      );

      return {
        files
      };
    },

    async putUploadedAsset(assetId, token, body, contentType) {
      const asset = await config.repository.getAsset(assetId);
      if (!asset) {
        throw new Error(`Unknown asset: ${assetId}`);
      }
      if (!config.storage.putObject) {
        throw new Error("The active storage adapter expects direct-to-storage uploads.");
      }
      await config.storage.putObject({
        asset,
        token,
        body,
        contentType: contentType || asset.content_type
      });
      return config.repository.updateAsset(assetId, {
        byte_size: body.byteLength,
        upload_status: "uploaded",
        uploaded_at: nowIso(),
        content_type: contentType || asset.content_type
      });
    },

    async getAsset(assetId) {
      return config.repository.getAsset(assetId);
    },

    async getAssetContent(assetId) {
      const asset = await config.repository.getAsset(assetId);
      if (!asset) {
        throw new Error(`Unknown asset: ${assetId}`);
      }
      const object = await config.storage.getObject(asset);
      return {
        body: object.body,
        contentType: object.contentType,
        fileName: asset.file_name
      };
    },

    async createRankingJob(request) {
      const parsed = CreateRankingRequestSchema.parse(request);
      const assets = await config.repository.listAssets(parsed.asset_ids);
      if (assets.length !== parsed.asset_ids.length) {
        throw new Error("One or more assets were not found.");
      }
      if (assets.some((asset) => asset.upload_status !== "uploaded")) {
        throw new Error("All assets must be uploaded before ranking begins.");
      }

      const job: RankingJob = RankingJobSchema.parse({
        ranking_id: createId("rank"),
        status: "pending",
        method: parsed.method,
        target_count: parsed.target_count,
        asset_ids: parsed.asset_ids,
        listing_context: parsed.listing_context,
        policy: parsed.policy,
        provider_name: null,
        model_version: null,
        error: null,
        created_at: nowIso(),
        updated_at: nowIso(),
        result: null
      });

      const created = await config.repository.createRanking(job);
      await config.scheduler.enqueueRanking(created.ranking_id);
      return created;
    },

    async getRankingJob(rankingId, options) {
      const ranking = await config.repository.getRanking(rankingId);
      if (!ranking) {
        return null;
      }
      return withPreviewUrls(ranking, options?.baseUrl);
    },

    async processRankingJob(rankingId) {
      const job = await config.repository.getRanking(rankingId);
      if (!job || job.status === "completed" || job.status === "processing") {
        return;
      }

      await config.repository.updateRanking(rankingId, {
        status: "processing",
        error: null
      });

      try {
        const assets = await config.repository.listAssets(job.asset_ids);
        const provider = (job.method === "llm_judge" ? config.llmProvider : config.cvProvider) as RankingProvider;
        const providerInputs = await Promise.all(
          assets.map(async (asset) => {
            const object = await config.storage.getObject(asset);
            return {
              asset,
              bytes: object.body
            };
          })
        );

        const rawAssessments = await provider.analyze(providerInputs);
        const duplicateGroups = buildDuplicateGroups(rawAssessments);
        const rankingResult = buildRankingResult({
          assessments: addDuplicateIssue(rawAssessments, duplicateGroups),
          method: job.method,
          listingContext: job.listing_context,
          policy: job.policy,
          targetCount: job.target_count,
          providerName: provider.providerName,
          modelVersion: provider.modelVersion
        });

        await config.repository.updateRanking(rankingId, {
          status: "completed",
          provider_name: provider.providerName,
          model_version: provider.modelVersion,
          result: rankingResult,
          error: null
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown processing error.";
        await config.repository.updateRanking(rankingId, {
          status: "failed",
          error: message
        });
      }
    },

    async submitFeedback(rankingId, request) {
      const ranking = await config.repository.getRanking(rankingId);
      if (!ranking) {
        throw new Error(`Unknown ranking: ${rankingId}`);
      }
      if (ranking.status !== "completed" || !ranking.result) {
        throw new Error("Feedback can only be submitted for completed rankings.");
      }

      const parsed = FeedbackRequestSchema.parse({
        ...request,
        corrected_labels: request.corrected_labels.map((label) => ({
          ...label,
          predicted_view_type: normalizeViewType(label.predicted_view_type, label.view_tags),
          view_tags: normalizeViewTags(label.view_tags)
        }))
      });

      const allowedIds = new Set(ranking.result.ordered_images.map((image) => image.image_id));
      if (parsed.ordered_asset_ids.some((assetId) => !allowedIds.has(assetId))) {
        throw new Error("Feedback order contains assets that are not part of the ranking result.");
      }

      const feedback = FeedbackRecordSchema.parse({
        feedback_id: createId("fb"),
        ranking_id: rankingId,
        ordered_asset_ids: parsed.ordered_asset_ids,
        corrected_labels: parsed.corrected_labels,
        notes: parsed.notes ?? null,
        exported: parsed.exported,
        created_at: nowIso()
      });

      return config.repository.createFeedback(feedback);
    },

    inngest: config.inngest
  };
}

export function getApp(): AppServices {
  if (!globalThis.__listingPhotoRankerApp__) {
    const repository = createRepository();
    const storage = createStorage();
    const llmProvider = new HeuristicLlmJudgeProvider({
      modelVersion: process.env.LLM_JUDGE_MODEL ?? "gpt-5.4"
    });
    const cvProvider = new HeuristicCvProvider();
    const inngest = createInngestClient();
    let appRef: AppServices | undefined;
    const scheduler =
      process.env.QUEUE_PROVIDER === "inngest" && process.env.INNGEST_EVENT_KEY
        ? new InngestJobScheduler(inngest)
        : new InlineJobScheduler(async (rankingId) => {
            await appRef?.processRankingJob(rankingId);
          });

    const app = createApp({
      repository,
      storage,
      scheduler,
      llmProvider,
      cvProvider,
      inngest
    });
    appRef = app;
    globalThis.__listingPhotoRankerApp__ = app;
  }
  return globalThis.__listingPhotoRankerApp__;
}
