#!/usr/bin/env node
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { inferContentType, type FeedbackRequest, type PropertyType, type RankingJob, type RankingResult } from "@listing-photo-ranker/core";

import { buildCliRankingRequest, buildCliSyncRankingOptions } from "./rank-request";

type CommonFlags = {
  apiBaseUrl: string;
  apiKey?: string;
  json: boolean;
};

function usage(): never {
  console.error(`Usage:
  listing-photo-ranker rank <files...|directory> [--sync] [--method llm_judge|cv] [--top 8] [--property-type single_family|condo|townhouse|multi_family|other] [--out result.json] [--api-base-url URL] [--api-key KEY] [--json]
  listing-photo-ranker status <ranking_id> [--api-base-url URL] [--api-key KEY] [--json]
  listing-photo-ranker feedback <ranking_id> --order-file feedback.json [--api-base-url URL] [--api-key KEY] [--json]`);
  process.exit(1);
}

function parseCommonFlags(tokens: string[]): { common: CommonFlags; values: Record<string, string | boolean | undefined>; positionals: string[] } {
  const { values, positionals } = parseArgs({
    args: tokens,
    options: {
      "api-base-url": {
        type: "string",
        default: process.env.LISTING_PHOTO_RANKER_API_BASE_URL ?? "http://127.0.0.1:3000"
      },
      "api-key": {
        type: "string"
      },
      json: {
        type: "boolean",
        default: false
      },
      sync: {
        type: "boolean",
        default: false
      },
      method: {
        type: "string"
      },
      "property-type": {
        type: "string"
      },
      top: {
        type: "string"
      },
      out: {
        type: "string"
      },
      "order-file": {
        type: "string"
      }
    },
    allowPositionals: true
  });

  return {
    common: {
      apiBaseUrl: String(values["api-base-url"]).replace(/\/$/, ""),
      apiKey: typeof values["api-key"] === "string" ? values["api-key"] : undefined,
      json: Boolean(values.json)
    },
    values: values as Record<string, string | boolean | undefined>,
    positionals
  };
}

async function enumerateImageFiles(entries: string[]): Promise<string[]> {
  const discovered: string[] = [];

  for (const entry of entries) {
    const fullPath = resolve(entry);
    const stats = await stat(fullPath);
    if (stats.isDirectory()) {
      const childEntries = await readdir(fullPath);
      const nested = await enumerateImageFiles(childEntries.map((child) => join(fullPath, child)));
      discovered.push(...nested);
      continue;
    }

    if (/\.(png|jpe?g|webp|gif)$/i.test(fullPath)) {
      discovered.push(fullPath);
    }
  }

  return discovered;
}

async function apiRequest<T>(common: CommonFlags, path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (common.apiKey) {
    headers.set("x-api-key", common.apiKey);
  }
  if (options.body && !(options.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${common.apiBaseUrl}${path}`, {
    ...options,
    headers
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed: ${response.status}`);
  }
  return payload as T;
}

async function handleRank(tokens: string[]) {
  const { common, values, positionals } = parseCommonFlags(tokens);
  if (positionals.length === 0) {
    usage();
  }

  const files = await enumerateImageFiles(positionals);
  if (files.length === 0) {
    throw new Error("No image files were found.");
  }

  const targetCount = Math.min(Number(values.top ?? files.length), files.length);
  const method = (values.method as "llm_judge" | "cv" | undefined) ?? "llm_judge";
  const propertyType = values["property-type"] as PropertyType | undefined;
  const useSync = Boolean(values.sync);

  if (useSync) {
    const formData = new FormData();
    const options = buildCliSyncRankingOptions({
      method,
      targetCount,
      propertyType
    });

    for (const filePath of files) {
      const bytes = await readFile(filePath);
      formData.append("files", new Blob([bytes], { type: inferContentType(filePath) }), filePath.split("/").pop() ?? filePath);
    }

    formData.append("method", options.method);
    formData.append("target_count", String(options.target_count));
    formData.append("property_type", options.listing_context?.property_type ?? "other");
    formData.append("prefer_exterior_hero", String(options.policy?.prefer_exterior_hero ?? true));
    formData.append("dedupe", String(options.policy?.dedupe ?? true));
    formData.append("require_room_diversity", String(options.policy?.require_room_diversity ?? true));

    const ranking = await apiRequest<RankingResult>(common, "/api/v1/rankings/sync", {
      method: "POST",
      body: formData
    });

    if (typeof values.out === "string") {
      await writeFile(resolve(values.out), JSON.stringify(ranking, null, 2));
    }

    if (common.json) {
      console.log(JSON.stringify(ranking, null, 2));
      return;
    }

    console.log(`Stateless ranking complete: ${ranking.method}`);
    for (const image of ranking.ordered_images) {
      console.log(
        `#${image.position} ${image.file_name} :: ${image.predicted_view_type} :: overall ${Math.round(image.overall_score * 100)}`
      );
    }
    return;
  }

  const uploadPayload = await apiRequest<{
    files: Array<{ asset_id: string; file_name: string; upload_url: string; headers: Record<string, string> }>;
  }>(common, "/api/v1/uploads", {
    method: "POST",
    body: JSON.stringify({
      files: files.map((filePath) => ({
        file_name: filePath.split("/").pop() ?? filePath,
        content_type: inferContentType(filePath)
      }))
    })
  });

  await Promise.all(
    uploadPayload.files.map(async (target, index) => {
      const bytes = await readFile(files[index]);
      const headers = new Headers(target.headers);
      if (!headers.has("content-type")) {
        headers.set("content-type", inferContentType(files[index]));
      }
      const response = await fetch(target.upload_url, {
        method: "PUT",
        headers,
        body: bytes
      });
      if (!response.ok) {
        throw new Error(`Upload failed for ${target.file_name}`);
      }
    })
  );

  const ranking = await apiRequest<RankingJob>(common, "/api/v1/rankings", {
    method: "POST",
    body: JSON.stringify(
      buildCliRankingRequest({
        method,
        targetCount,
        assetIds: uploadPayload.files.map((file) => file.asset_id),
        propertyType
      })
    )
  });

  let latest = ranking;
  while (latest.status === "pending" || latest.status === "processing") {
    await new Promise((resolve) => setTimeout(resolve, 800));
    latest = await apiRequest<RankingJob>(common, `/api/v1/rankings/${latest.ranking_id}`);
  }

  if (typeof values.out === "string") {
    await writeFile(resolve(values.out), JSON.stringify(latest, null, 2));
  }

  if (common.json) {
    console.log(JSON.stringify(latest, null, 2));
    return;
  }

  console.log(`Ranking ${latest.ranking_id}: ${latest.status}`);
  if (latest.result) {
    for (const image of latest.result.ordered_images) {
      console.log(
        `#${image.position} ${image.file_name} :: ${image.predicted_view_type} :: overall ${Math.round(image.overall_score * 100)}`
      );
    }
  }
}

async function handleStatus(tokens: string[]) {
  const { common, positionals } = parseCommonFlags(tokens);
  const rankingId = positionals[0];
  if (!rankingId) {
    usage();
  }

  const ranking = await apiRequest<RankingJob>(common, `/api/v1/rankings/${rankingId}`);
  if (common.json) {
    console.log(JSON.stringify(ranking, null, 2));
    return;
  }

  console.log(`Ranking ${ranking.ranking_id}: ${ranking.status}`);
  if (ranking.error) {
    console.log(`Error: ${ranking.error}`);
  }
  if (ranking.result) {
    console.log(`Top image: ${ranking.result.ordered_images[0]?.file_name ?? "n/a"}`);
  }
}

async function handleFeedback(tokens: string[]) {
  const { common, values, positionals } = parseCommonFlags(tokens);
  const rankingId = positionals[0];
  const orderFile = values["order-file"];
  if (!rankingId || typeof orderFile !== "string") {
    usage();
  }

  const payload = JSON.parse(await readFile(resolve(orderFile), "utf8")) as FeedbackRequest;
  const feedback = await apiRequest(common, `/api/v1/rankings/${rankingId}/feedback`, {
    method: "POST",
    body: JSON.stringify(payload)
  });

  if (common.json) {
    console.log(JSON.stringify(feedback, null, 2));
    return;
  }

  console.log(`Feedback recorded for ${rankingId}.`);
}

export async function main(argv = process.argv.slice(2)) {
  const [command, ...tokens] = argv;

  if (!command) {
    usage();
  }

  switch (command) {
    case "rank":
      await handleRank(tokens);
      break;
    case "status":
      await handleStatus(tokens);
      break;
    case "feedback":
      await handleFeedback(tokens);
      break;
    default:
      usage();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Unexpected CLI failure.");
    process.exit(1);
  });
}
