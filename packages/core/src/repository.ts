import { Pool, type PoolClient } from "pg";

import type { AssetRecord, FeedbackRecord, ListingContext, RankingJob, RankingStatus } from "./schemas";
import { nowIso } from "./utils";

const POSTGRES_SCHEMA_LOCK_ID = 91834721;

export interface Repository {
  createAsset(asset: AssetRecord): Promise<AssetRecord>;
  getAsset(assetId: string): Promise<AssetRecord | null>;
  listAssets(assetIds: string[]): Promise<AssetRecord[]>;
  updateAsset(assetId: string, patch: Partial<AssetRecord>): Promise<AssetRecord>;
  createRanking(job: RankingJob): Promise<RankingJob>;
  getRanking(rankingId: string): Promise<RankingJob | null>;
  updateRanking(
    rankingId: string,
    patch: Partial<Pick<RankingJob, "status" | "provider_name" | "model_version" | "result" | "error" | "updated_at">>
  ): Promise<RankingJob>;
  createFeedback(feedback: FeedbackRecord): Promise<FeedbackRecord>;
}

type InternalState = {
  assets: Map<string, AssetRecord>;
  rankings: Map<string, RankingJob>;
  feedback: Map<string, FeedbackRecord>;
};

function createInitialState(): InternalState {
  return {
    assets: new Map(),
    rankings: new Map(),
    feedback: new Map()
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __listingPhotoRankerRepoState__: InternalState | undefined;
}

function getGlobalState(): InternalState {
  if (!globalThis.__listingPhotoRankerRepoState__) {
    globalThis.__listingPhotoRankerRepoState__ = createInitialState();
  }
  return globalThis.__listingPhotoRankerRepoState__;
}

export class MemoryRepository implements Repository {
  private readonly state = getGlobalState();

  async createAsset(asset: AssetRecord): Promise<AssetRecord> {
    this.state.assets.set(asset.asset_id, asset);
    return asset;
  }

  async getAsset(assetId: string): Promise<AssetRecord | null> {
    return this.state.assets.get(assetId) ?? null;
  }

  async listAssets(assetIds: string[]): Promise<AssetRecord[]> {
    return assetIds.map((assetId) => this.state.assets.get(assetId)).filter(Boolean) as AssetRecord[];
  }

  async updateAsset(assetId: string, patch: Partial<AssetRecord>): Promise<AssetRecord> {
    const existing = this.state.assets.get(assetId);
    if (!existing) {
      throw new Error(`Unknown asset: ${assetId}`);
    }
    const updated = { ...existing, ...patch };
    this.state.assets.set(assetId, updated);
    return updated;
  }

  async createRanking(job: RankingJob): Promise<RankingJob> {
    this.state.rankings.set(job.ranking_id, job);
    return job;
  }

  async getRanking(rankingId: string): Promise<RankingJob | null> {
    return this.state.rankings.get(rankingId) ?? null;
  }

  async updateRanking(
    rankingId: string,
    patch: Partial<Pick<RankingJob, "status" | "provider_name" | "model_version" | "result" | "error" | "updated_at">>
  ): Promise<RankingJob> {
    const existing = this.state.rankings.get(rankingId);
    if (!existing) {
      throw new Error(`Unknown ranking: ${rankingId}`);
    }
    const updated = { ...existing, ...patch, updated_at: patch.updated_at ?? nowIso() };
    this.state.rankings.set(rankingId, updated);
    return updated;
  }

  async createFeedback(feedback: FeedbackRecord): Promise<FeedbackRecord> {
    this.state.feedback.set(feedback.feedback_id, feedback);
    return feedback;
  }
}

type AssetRow = {
  id: string;
  file_name: string;
  content_type: string;
  byte_size: number | null;
  storage_key: string;
  upload_token: string;
  upload_status: "pending" | "uploaded";
  created_at: Date;
  uploaded_at: Date | null;
};

type RankingRow = {
  id: string;
  method: RankingJob["method"];
  target_count: number;
  asset_ids: string[];
  listing_context: ListingContext;
  policy: RankingJob["policy"];
  status: RankingStatus;
  provider_name: string | null;
  model_version: string | null;
  result: RankingJob["result"];
  error: string | null;
  created_at: Date;
  updated_at: Date;
};

type FeedbackRow = {
  id: string;
  ranking_id: string;
  ordered_asset_ids: string[];
  corrected_labels: FeedbackRecord["corrected_labels"];
  notes: string | null;
  exported: boolean;
  created_at: Date;
};

function mapAssetRow(row: AssetRow): AssetRecord {
  return {
    asset_id: row.id,
    file_name: row.file_name,
    content_type: row.content_type,
    byte_size: row.byte_size,
    storage_key: row.storage_key,
    upload_token: row.upload_token,
    upload_status: row.upload_status,
    created_at: row.created_at.toISOString(),
    uploaded_at: row.uploaded_at ? row.uploaded_at.toISOString() : null
  };
}

function mapRankingRow(row: RankingRow): RankingJob {
  return {
    ranking_id: row.id,
    status: row.status,
    method: row.method,
    target_count: row.target_count,
    asset_ids: row.asset_ids,
    listing_context: row.listing_context,
    policy: row.policy,
    provider_name: row.provider_name,
    model_version: row.model_version,
    error: row.error,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    result: row.result
  };
}

function mapFeedbackRow(row: FeedbackRow): FeedbackRecord {
  return {
    feedback_id: row.id,
    ranking_id: row.ranking_id,
    ordered_asset_ids: row.ordered_asset_ids,
    corrected_labels: row.corrected_labels,
    notes: row.notes,
    exported: row.exported,
    created_at: row.created_at.toISOString()
  };
}

export class PostgresRepository implements Repository {
  private schemaReady = false;

  constructor(private readonly pool: Pool) {}

  private async withSchema<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      if (!this.schemaReady) {
        await client.query("select pg_advisory_lock($1)", [POSTGRES_SCHEMA_LOCK_ID]);
        try {
          if (!this.schemaReady) {
            await client.query(`
              create table if not exists assets (
                id text primary key,
                file_name text not null,
                content_type text not null,
                byte_size integer,
                storage_key text not null,
                upload_token text not null,
                upload_status text not null,
                created_at timestamptz not null default now(),
                uploaded_at timestamptz
              );
            `);
            await client.query(`
              create table if not exists ranking_jobs (
                id text primary key,
                method text not null,
                target_count integer not null,
                asset_ids jsonb not null,
                listing_context jsonb not null default '{"listing_intent":"sale","property_type":"other"}'::jsonb,
                policy jsonb not null,
                status text not null,
                provider_name text,
                model_version text,
                result jsonb,
                error text,
                created_at timestamptz not null default now(),
                updated_at timestamptz not null default now()
              );
            `);
            await client.query(`
              alter table ranking_jobs
              add column if not exists listing_context jsonb not null default '{"listing_intent":"sale","property_type":"other"}'::jsonb
            `);
            await client.query(`
              create table if not exists feedback (
                id text primary key,
                ranking_id text not null references ranking_jobs(id) on delete cascade,
                ordered_asset_ids jsonb not null,
                corrected_labels jsonb not null,
                notes text,
                exported boolean not null default false,
                created_at timestamptz not null default now()
              );
            `);
            this.schemaReady = true;
          }
        } finally {
          await client.query("select pg_advisory_unlock($1)", [POSTGRES_SCHEMA_LOCK_ID]);
        }
      }
      return await callback(client);
    } finally {
      client.release();
    }
  }

  async createAsset(asset: AssetRecord): Promise<AssetRecord> {
    return this.withSchema(async (client) => {
      const result = await client.query<AssetRow>(
        `
          insert into assets (id, file_name, content_type, byte_size, storage_key, upload_token, upload_status, created_at, uploaded_at)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          returning *
        `,
        [
          asset.asset_id,
          asset.file_name,
          asset.content_type,
          asset.byte_size,
          asset.storage_key,
          asset.upload_token,
          asset.upload_status,
          asset.created_at,
          asset.uploaded_at
        ]
      );

      return mapAssetRow(result.rows[0]);
    });
  }

  async getAsset(assetId: string): Promise<AssetRecord | null> {
    return this.withSchema(async (client) => {
      const result = await client.query<AssetRow>("select * from assets where id = $1", [assetId]);
      return result.rows[0] ? mapAssetRow(result.rows[0]) : null;
    });
  }

  async listAssets(assetIds: string[]): Promise<AssetRecord[]> {
    return this.withSchema(async (client) => {
      const result = await client.query<AssetRow>("select * from assets where id = any($1::text[])", [assetIds]);
      const byId = new Map(result.rows.map((row) => [row.id, mapAssetRow(row)]));
      return assetIds.map((assetId) => byId.get(assetId)).filter(Boolean) as AssetRecord[];
    });
  }

  async updateAsset(assetId: string, patch: Partial<AssetRecord>): Promise<AssetRecord> {
    const current = await this.getAsset(assetId);
    if (!current) {
      throw new Error(`Unknown asset: ${assetId}`);
    }
    const merged = { ...current, ...patch };
    return this.withSchema(async (client) => {
      const result = await client.query<AssetRow>(
        `
          update assets
          set file_name = $2,
              content_type = $3,
              byte_size = $4,
              storage_key = $5,
              upload_token = $6,
              upload_status = $7,
              uploaded_at = $8
          where id = $1
          returning *
        `,
        [
          assetId,
          merged.file_name,
          merged.content_type,
          merged.byte_size,
          merged.storage_key,
          merged.upload_token,
          merged.upload_status,
          merged.uploaded_at
        ]
      );
      return mapAssetRow(result.rows[0]);
    });
  }

  async createRanking(job: RankingJob): Promise<RankingJob> {
    return this.withSchema(async (client) => {
      const result = await client.query<RankingRow>(
        `
          insert into ranking_jobs (id, method, target_count, asset_ids, listing_context, policy, status, provider_name, model_version, result, error, created_at, updated_at)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          returning *
        `,
        [
          job.ranking_id,
          job.method,
          job.target_count,
          JSON.stringify(job.asset_ids),
          JSON.stringify(job.listing_context),
          JSON.stringify(job.policy),
          job.status,
          job.provider_name,
          job.model_version,
          job.result ? JSON.stringify(job.result) : null,
          job.error,
          job.created_at,
          job.updated_at
        ]
      );
      return mapRankingRow(result.rows[0]);
    });
  }

  async getRanking(rankingId: string): Promise<RankingJob | null> {
    return this.withSchema(async (client) => {
      const result = await client.query<RankingRow>("select * from ranking_jobs where id = $1", [rankingId]);
      return result.rows[0] ? mapRankingRow(result.rows[0]) : null;
    });
  }

  async updateRanking(
    rankingId: string,
    patch: Partial<Pick<RankingJob, "status" | "provider_name" | "model_version" | "result" | "error" | "updated_at">>
  ): Promise<RankingJob> {
    const current = await this.getRanking(rankingId);
    if (!current) {
      throw new Error(`Unknown ranking: ${rankingId}`);
    }
    const merged = { ...current, ...patch, updated_at: patch.updated_at ?? nowIso() };
    return this.withSchema(async (client) => {
      const result = await client.query<RankingRow>(
        `
          update ranking_jobs
          set status = $2,
              provider_name = $3,
              model_version = $4,
              result = $5,
              error = $6,
              updated_at = $7
          where id = $1
          returning *
        `,
        [
          rankingId,
          merged.status,
          merged.provider_name,
          merged.model_version,
          merged.result ? JSON.stringify(merged.result) : null,
          merged.error,
          merged.updated_at
        ]
      );
      return mapRankingRow(result.rows[0]);
    });
  }

  async createFeedback(feedback: FeedbackRecord): Promise<FeedbackRecord> {
    return this.withSchema(async (client) => {
      const result = await client.query<FeedbackRow>(
        `
          insert into feedback (id, ranking_id, ordered_asset_ids, corrected_labels, notes, exported, created_at)
          values ($1, $2, $3, $4, $5, $6, $7)
          returning *
        `,
        [
          feedback.feedback_id,
          feedback.ranking_id,
          JSON.stringify(feedback.ordered_asset_ids),
          JSON.stringify(feedback.corrected_labels),
          feedback.notes,
          feedback.exported,
          feedback.created_at
        ]
      );
      return mapFeedbackRow(result.rows[0]);
    });
  }
}
