import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { IntegrationGuide } from "../apps/web/components/integration-guide";

test("integration guide renders API setup instructions by default", () => {
  const html = renderToStaticMarkup(createElement(IntegrationGuide));

  assert.match(html, /The same upload, ranking, and feedback flow is available for automation and batch work/);
  assert.match(html, /Switch between API and CLI instructions/);
  assert.match(html, /POST \/api\/v1\/uploads/);
  assert.match(html, /x-api-key/);
});

test("integration guide can render CLI instructions", () => {
  const html = renderToStaticMarkup(createElement(IntegrationGuide, { initialMode: "cli" }));

  assert.match(html, /node packages\/cli\/bin\/listing-photo-ranker\.js rank/);
  assert.match(html, /node packages\/cli\/bin\/listing-photo-ranker\.js status/);
  assert.match(html, /--api-base-url/);
});

test("integration guide renders stateless sync instructions", () => {
  const html = renderToStaticMarkup(createElement(IntegrationGuide, { runtimeMode: "stateless", initialMode: "api" }));

  assert.match(html, /\/api\/v1\/rankings\/sync/);
  assert.match(html, /multipart\/form-data/);
  assert.match(html, /client-side/);
});
