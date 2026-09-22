import assert from "node:assert/strict";
import { after, test } from "node:test";
import { performMarketRecon } from "./search.js";

const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
});

test("novel ideas without search evidence do not receive invented market facts", async () => {
  globalThis.fetch = async () => new Response("Unavailable", { status: 503 });

  const context = await performMarketRecon("A device that lets people taste music");

  assert.deepEqual(context.topCompetitors, []);
  assert.deepEqual(context.typicalPricingModels, []);
  assert.deepEqual(context.knownPainPoints, []);
  assert.deepEqual(context.sources, []);
  assert.match(context.existingSubstitutesSummary, /not verified|unknown|hypothes/i);
});

test("market recon looks for current workarounds when no direct competitor exists", async () => {
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("current%20workaround")) {
      return new Response(
        '<a class="result__snippet">People currently use sound-to-color associations for sensory experiences.</a>',
        { status: 200 }
      );
    }
    return new Response("Unavailable", { status: 503 });
  };

  const context = await performMarketRecon("A device that lets people taste music");

  assert.equal(context.sources.length, 1);
  assert.match(context.sources[0]!.snippet, /sound-to-color associations/);
  assert.deepEqual(context.topCompetitors, []);
});
