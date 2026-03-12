import test from "node:test";
import assert from "node:assert/strict";

import { getBaseUrlFromRequest } from "../apps/web/lib/http";

test("base url resolver prefers the request origin header", () => {
  const request = new Request("http://localhost:3100/api/v1/uploads", {
    headers: {
      origin: "http://127.0.0.1:3100",
      host: "127.0.0.1:3100"
    }
  });

  assert.equal(getBaseUrlFromRequest(request), "http://127.0.0.1:3100");
});

test("base url resolver falls back to host when origin is absent", () => {
  const request = new Request("http://localhost:3100/api/v1/rankings/job_1", {
    headers: {
      host: "127.0.0.1:3100"
    }
  });

  assert.equal(getBaseUrlFromRequest(request), "http://127.0.0.1:3100");
});
