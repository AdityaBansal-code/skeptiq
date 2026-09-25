interface SpeakerContextInput {
  speakerId: string;
  reactions: Array<{ personaId: string; content: string }>;
  turns: Array<{ personaId: string; content: string }>;
  personaNames: Map<string, string>;
}

export function spokenPart(content: string): string {
  return content.replace(/💭\s*\*\([^)]*\)\*\s*/g, "").trim();
}

export function assessDialogueTurn(content: string): string | null {
  const spoken = spokenPart(content)
    .replace(/^['"“]+|['"”]+$/g, "")
    .trim();
  if (!spoken) return "empty dialogue";

  if (
    /<\/?think>|\[\/?(?:thinking|reasoning)\]|\b(?:we need to respond|we need to keep|must avoid forbidden|the rule:|the user asked|as an ai|system prompt|roleplay instructions)\b/i.test(
      spoken,
    )
  ) {
    return "model planning or instruction text";
  }

  if (!/[.!?…][\s'"”’)]*$/.test(spoken)) return "incomplete dialogue";
  return null;
}

export async function requestDialogueTurn(
  generate: (correction: string) => Promise<string>,
): Promise<string> {
  let correction = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const content = (await generate(correction)).trim();
    const problem = assessDialogueTurn(content);
    if (!problem) return content;
    correction = `Your previous response was rejected as ${problem}. Speak only as the participant, in 1-3 complete sentences. Do not include planning, instructions, or an unfinished sentence.`;
  }
  throw new Error("Could not generate valid dialogue after 3 attempts");
}

export function buildSpeakerContext(input: SpeakerContextInput): string {
  const initial = input.reactions.find((r) => r.personaId === input.speakerId);
  const ownLast = [...input.turns].reverse().find((t) => t.personaId === input.speakerId);
  const recent = input.turns.slice(-4);

  const lines = [
    `YOUR INITIAL REACTION: ${initial?.content || "No initial reaction recorded."}`,
    `YOUR LAST SPOKEN TURN: ${ownLast ? spokenPart(ownLast.content) : "You have not spoken yet."}`,
    "RECENT GROUP CONVERSATION:",
    ...recent.map((turn) => {
      const name = input.personaNames.get(turn.personaId) || "Participant";
      return `${name}: ${spokenPart(turn.content)}`;
    }),
  ];

  return lines.join("\n");
}
