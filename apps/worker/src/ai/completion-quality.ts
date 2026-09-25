export function requireFinishedText(content: string, finishReason?: string | null): string {
  if (finishReason === "length") {
    throw new Error("Model response stopped at token limit");
  }
  if (finishReason === "content_filter") {
    throw new Error("Model response was blocked by content filter");
  }
  return content;
}
