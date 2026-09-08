import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";
import { logger } from "../logger.js";

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    logger.info("loading local embedding model (all-MiniLM-L6-v2)...");
    extractorPromise = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return extractorPromise;
}

/**
 * Generates a normalized 384-dimensional vector embedding for text using
 * local ONNX inference ($0 cost, 0 external API calls).
 */
export async function embedText(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

/**
 * Batch embed multiple texts sequentially or in small chunks.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const extractor = await getExtractor();
  const results: number[][] = [];
  for (const text of texts) {
    const output = await extractor(text, { pooling: "mean", normalize: true });
    results.push(Array.from(output.data as Float32Array));
  }
  return results;
}
