import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { AssetRecord, UploadTargetInternal } from "./schemas";
import { getBaseUrl } from "./utils";

export type StoredObject = {
  body: Buffer;
  contentType: string;
};

export interface StorageAdapter {
  createUploadTarget(asset: AssetRecord, options?: { baseUrl?: string }): Promise<UploadTargetInternal>;
  putObject?(input: {
    asset: AssetRecord;
    token: string;
    body: Buffer;
    contentType: string;
  }): Promise<void>;
  getObject(asset: AssetRecord): Promise<StoredObject>;
}

type LocalObjectStore = Map<string, StoredObject>;

declare global {
  // eslint-disable-next-line no-var
  var __listingPhotoRankerObjects__: LocalObjectStore | undefined;
}

function getLocalObjectStore(): LocalObjectStore {
  if (!globalThis.__listingPhotoRankerObjects__) {
    globalThis.__listingPhotoRankerObjects__ = new Map();
  }
  return globalThis.__listingPhotoRankerObjects__;
}

export class LocalStorageAdapter implements StorageAdapter {
  private readonly objects = getLocalObjectStore();

  async createUploadTarget(asset: AssetRecord, options?: { baseUrl?: string }): Promise<UploadTargetInternal> {
    const baseUrl = getBaseUrl(options?.baseUrl);
    return {
      upload_url: `${baseUrl}/api/v1/uploads/${asset.asset_id}/content?token=${asset.upload_token}`,
      upload_method: "PUT",
      headers: {},
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    };
  }

  async putObject(input: {
    asset: AssetRecord;
    token: string;
    body: Buffer;
    contentType: string;
  }): Promise<void> {
    if (input.token !== input.asset.upload_token) {
      throw new Error("Invalid upload token.");
    }
    this.objects.set(input.asset.asset_id, {
      body: input.body,
      contentType: input.contentType || input.asset.content_type
    });
  }

  async getObject(asset: AssetRecord): Promise<StoredObject> {
    const object = this.objects.get(asset.asset_id);
    if (!object) {
      throw new Error(`No uploaded bytes found for asset ${asset.asset_id}`);
    }
    return object;
  }
}

export class S3StorageAdapter implements StorageAdapter {
  private readonly client: S3Client;

  constructor(
    private readonly config: {
      bucket: string;
      region: string;
      accessKeyId?: string;
      secretAccessKey?: string;
      endpoint?: string;
    }
  ) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint || undefined,
      forcePathStyle: Boolean(config.endpoint),
      credentials:
        config.accessKeyId && config.secretAccessKey
          ? {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey
            }
          : undefined
    });
  }

  async createUploadTarget(asset: AssetRecord): Promise<UploadTargetInternal> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: asset.storage_key,
      ContentType: asset.content_type
    });

    return {
      upload_url: await getSignedUrl(this.client, command, { expiresIn: 900 }),
      upload_method: "PUT",
      headers: {
        "content-type": asset.content_type
      },
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    };
  }

  async getObject(asset: AssetRecord): Promise<StoredObject> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: asset.storage_key
      })
    );

    const body = response.Body;
    if (!body) {
      throw new Error(`S3 object not found for ${asset.asset_id}`);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Buffer | Uint8Array | string>) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
    }

    return {
      body: Buffer.concat(chunks),
      contentType: response.ContentType ?? asset.content_type
    };
  }
}
