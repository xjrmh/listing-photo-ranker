import test from "node:test";
import assert from "node:assert/strict";

import { resolveAppInfrastructure } from "@listing-photo-ranker/core";

function env(values: Partial<NodeJS.ProcessEnv>): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    ...values
  } as NodeJS.ProcessEnv;
}

test("app infrastructure defaults to in-memory modes locally", () => {
  assert.deepEqual(resolveAppInfrastructure(env({})), {
    repository: "memory",
    storage: "local"
  });
});

test("app infrastructure uses Postgres-backed uploads when DATABASE_URL is set", () => {
  assert.deepEqual(resolveAppInfrastructure(env({ DATABASE_URL: "postgres://example" })), {
    repository: "postgres",
    storage: "postgres"
  });
});

test("app infrastructure prefers S3 storage when both DATABASE_URL and S3 are configured", () => {
  assert.deepEqual(
    resolveAppInfrastructure(
      env({
      DATABASE_URL: "postgres://example",
      STORAGE_PROVIDER: "s3",
      S3_BUCKET: "listing-photo-ranker"
      })
    ),
    {
      repository: "postgres",
      storage: "s3"
    }
  );
});

test("app infrastructure rejects Vercel deployments without a database", () => {
  assert.throws(
    () => resolveAppInfrastructure(env({ VERCEL: "1" })),
    /DATABASE_URL is required on Vercel/
  );
});
