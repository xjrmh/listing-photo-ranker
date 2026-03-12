import test from "node:test";
import assert from "node:assert/strict";

import { resolveAppInfrastructure, resolveAppRuntimeMode, resolvePostgresPoolConfig } from "@listing-photo-ranker/core";

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

test("postgres pool config uses a bounded default connect timeout", () => {
  assert.deepEqual(resolvePostgresPoolConfig(env({ DATABASE_URL: "postgres://example" })), {
    connectionString: "postgres://example",
    connectionTimeoutMillis: 5000
  });
});

test("postgres pool config respects DATABASE_CONNECT_TIMEOUT_MS", () => {
  assert.deepEqual(
    resolvePostgresPoolConfig(
      env({
        DATABASE_URL: "postgres://example",
        DATABASE_CONNECT_TIMEOUT_MS: "1200"
      })
    ),
    {
      connectionString: "postgres://example",
      connectionTimeoutMillis: 1200
    }
  );
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

test("app runtime mode defaults to stateful", () => {
  assert.equal(resolveAppRuntimeMode(env({})), "stateful");
});

test("app infrastructure allows stateless Vercel deployments without a database", () => {
  assert.deepEqual(resolveAppInfrastructure(env({ VERCEL: "1", APP_RUNTIME_MODE: "stateless" })), {
    repository: "memory",
    storage: "local"
  });
});
