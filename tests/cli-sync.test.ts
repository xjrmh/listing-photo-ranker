import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { RankingResult } from "@listing-photo-ranker/core";

import { main } from "../packages/cli/src/index";
import { createSolidImageBuffer } from "./helpers";

const FIXTURE_RESULT: RankingResult = {
  ordered_images: [
    {
      image_id: "sync_1",
      position: 1,
      file_name: "front.png",
      overall_score: 0.91,
      hero_score: 0.95,
      technical_quality_score: 0.86,
      predicted_view_type: "front_exterior",
      view_tags: ["greenery"],
      issues: [],
      confidence: 0.84,
      rationale: "Strong exterior lead."
    }
  ],
  diagnostics: {
    duplicate_groups: [],
    missing_coverage: [],
    source_asset_count: 1,
    selected_asset_count: 1
  },
  method: "llm_judge",
  provider_name: "heuristic-llm-judge",
  model_version: "gpt-5.4",
  feedback_allowed: true
};

async function withMockedCli<T>(callback: (state: { logs: string[] }) => Promise<T>): Promise<T> {
  const previousFetch = globalThis.fetch;
  const previousLog = console.log;
  const logs: string[] = [];

  globalThis.fetch = async () =>
    new Response(JSON.stringify(FIXTURE_RESULT), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  console.log = (...args: unknown[]) => {
    logs.push(args.join(" "));
  };

  try {
    return await callback({ logs });
  } finally {
    globalThis.fetch = previousFetch;
    console.log = previousLog;
  }
}

test("cli rank --sync prints JSON output from the sync endpoint", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "listing-photo-ranker-cli-sync-"));

  try {
    const imagePath = join(tempDir, "front.png");
    await writeFile(imagePath, await createSolidImageBuffer({ r: 120, g: 170, b: 120 }));

    await withMockedCli(async ({ logs }) => {
      await main(["rank", imagePath, "--sync", "--api-base-url", "http://127.0.0.1:3100", "--json"]);
      assert.deepEqual(JSON.parse(logs[0] ?? ""), FIXTURE_RESULT);
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("cli rank --sync writes the ranking result to --out", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "listing-photo-ranker-cli-sync-out-"));

  try {
    const imagePath = join(tempDir, "front.png");
    const outputPath = join(tempDir, "ranking.json");
    await writeFile(imagePath, await createSolidImageBuffer({ r: 120, g: 170, b: 120 }));

    await withMockedCli(async ({ logs }) => {
      await main(["rank", imagePath, "--sync", "--api-base-url", "http://127.0.0.1:3100", "--out", outputPath]);
      assert.match(logs.join("\n"), /Stateless ranking complete/);
    });

    assert.deepEqual(JSON.parse(await readFile(outputPath, "utf8")), FIXTURE_RESULT);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
