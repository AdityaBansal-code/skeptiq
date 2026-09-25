import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assessDialogueTurn,
  buildSpeakerContext,
  requestDialogueTurn,
} from "./dialogue-quality.js";

test("rejects a model planning its response instead of speaking in character", () => {
  assert.match(
    assessDialogueTurn("We need to respond as Marcus Johnson. Must avoid forbidden openers.") ?? "",
    /instruction|planning|meta/i,
  );
});

test("rejects unfinished dialogue but accepts a brief complete reaction", () => {
  assert.match(
    assessDialogueTurn("A tiered plan works best for me – a low-cost monthly") ?? "",
    /incomplete/i,
  );
  assert.equal(assessDialogueTurn("No, I wouldn't buy that."), null);
});

test("retries a bad model turn and returns only the complete replacement", async () => {
  const prompts: string[] = [];
  const replies = [
    "I could click through just to see if it",
    "No thanks. I wouldn't pay for this.",
  ];
  const result = await requestDialogueTurn(async (correction) => {
    prompts.push(correction);
    return replies[prompts.length - 1]!;
  });

  assert.equal(result, "No thanks. I wouldn't pay for this.");
  assert.equal(prompts.length, 2);
  assert.match(prompts[1]!, /incomplete/i);
});

test("does not save a bad turn when every attempt fails", async () => {
  let attempts = 0;
  await assert.rejects(
    requestDialogueTurn(async () => {
      attempts++;
      return "We need to respond as a persona";
    }),
    /valid dialogue/i,
  );
  assert.equal(attempts, 3);
});

test("speaker context includes own stance and prior turn without leaking another person's private thought", () => {
  const context = buildSpeakerContext({
    speakerId: "a",
    reactions: [{ personaId: "a", content: "I don't need this product." }],
    turns: [
      { personaId: "a", content: "I would pass unless it solves a real problem." },
      {
        personaId: "b",
        content: '💭 *(Internal: I am embarrassed.)*\n\n"Would you actually use it?"',
      },
    ],
    personaNames: new Map([
      ["a", "Asha"],
      ["b", "Ben"],
    ]),
  });

  assert.match(context, /I don't need this product/);
  assert.match(context, /I would pass unless/);
  assert.match(context, /Ben:.*Would you actually use it/);
  assert.doesNotMatch(context, /embarrassed/);
});
