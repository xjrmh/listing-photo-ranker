import test from "node:test";
import assert from "node:assert/strict";

import { normalizeViewTags, normalizeViewType } from "@listing-photo-ranker/core";

test("normalizeViewType maps common synonyms", () => {
  assert.equal(normalizeViewType("Master Suite", []), "primary_bedroom");
  assert.equal(normalizeViewType("Pool terrace twilight", []), "pool");
  assert.equal(normalizeViewType("Street block exterior", []), "street_view");
});

test("normalizeViewTags lowercases and deduplicates", () => {
  assert.deepEqual(normalizeViewTags([" Fireplace ", "fireplace", "Skyline View"]), ["fireplace", "skyline_view"]);
});

