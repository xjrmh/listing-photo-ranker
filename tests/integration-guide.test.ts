import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { IntegrationGuide } from "../apps/web/components/integration-guide";

test("integration guide renders API and CLI setup instructions", () => {
  const html = renderToStaticMarkup(createElement(IntegrationGuide));

  assert.match(html, /Run the same flow from the API or CLI/);
  assert.match(html, /POST \/api\/v1\/uploads/);
  assert.match(html, /node packages\/cli\/bin\/listing-photo-ranker\.js rank/);
  assert.match(html, /x-api-key/);
});
