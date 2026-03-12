import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { checkApiKey } from "../apps/web/lib/http";
import { WEB_UI_API_COOKIE_NAME, WEB_UI_API_TOKEN_CONTEXT } from "../apps/web/lib/api-auth";

test("api key check allows requests with the matching x-api-key header", () => {
  const originalApiKey = process.env.API_KEY;
  process.env.API_KEY = "test-api-key";

  try {
    const request = new Request("http://127.0.0.1:3000/api/v1/uploads", {
      headers: {
        "x-api-key": "test-api-key"
      }
    });

    assert.equal(checkApiKey(request), null);
  } finally {
    process.env.API_KEY = originalApiKey;
  }
});

test("api key check allows requests with the server-issued browser auth cookie", () => {
  const originalApiKey = process.env.API_KEY;
  process.env.API_KEY = "test-api-key";

  try {
    const token = createHmac("sha256", "test-api-key").update(WEB_UI_API_TOKEN_CONTEXT).digest("base64url");
    const request = new Request("http://127.0.0.1:3000/api/v1/rankings", {
      headers: {
        cookie: `${WEB_UI_API_COOKIE_NAME}=${token}`
      }
    });

    assert.equal(checkApiKey(request), null);
  } finally {
    process.env.API_KEY = originalApiKey;
  }
});

test("api key check rejects requests without a matching header or browser cookie", async () => {
  const originalApiKey = process.env.API_KEY;
  process.env.API_KEY = "test-api-key";

  try {
    const request = new Request("http://127.0.0.1:3000/api/v1/rankings");
    const response = checkApiKey(request);

    assert.ok(response);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Unauthorized." });
  } finally {
    process.env.API_KEY = originalApiKey;
  }
});
