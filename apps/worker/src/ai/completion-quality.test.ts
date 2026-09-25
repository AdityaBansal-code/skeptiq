import assert from "node:assert/strict";
import { test } from "node:test";
import { requireFinishedText } from "./completion-quality.js";

test("rejects text when the model stopped at its token limit", () => {
  assert.throws(() => requireFinishedText("I would buy it.", "length"), /token limit/i);
});

test("returns a finished response unchanged", () => {
  assert.equal(requireFinishedText("No, I would pass.", "stop"), "No, I would pass.");
});
