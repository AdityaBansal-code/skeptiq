import crypto from "crypto";
import dns from "dns/promises";
import { logger } from "../logger.js";

/**
 * Checks whether an IP address is a private, loopback, or cloud-metadata IP.
 */
function isPrivateIp(ip: string): boolean {
  // IPv4 loopback & 0.0.0.0
  if (ip.startsWith("127.") || ip === "0.0.0.0") return true;

  // RFC 1918 Private Ranges
  // 10.0.0.0/8
  if (ip.startsWith("10.")) return true;

  // 172.16.0.0/12 (172.16.x.x - 172.31.x.x)
  const match172 = ip.match(/^172\.(\d+)\./);
  if (match172 && match172[1]) {
    const octet = parseInt(match172[1], 10);
    if (octet >= 16 && octet <= 31) return true;
  }

  // 192.168.0.0/16
  if (ip.startsWith("192.168.")) return true;

  // Link-Local / Cloud Metadata: 169.254.0.0/16 (AWS / GCP / Azure metadata: 169.254.169.254)
  if (ip.startsWith("169.254.")) return true;

  // IPv6 loopback, link-local, unique local
  if (
    ip === "::1" ||
    ip === "::" ||
    ip.toLowerCase().startsWith("fe80:") || // link-local
    ip.toLowerCase().startsWith("fc00:") || // unique local
    ip.toLowerCase().startsWith("fd00:")
  ) {
    return true;
  }

  return false;
}

/**
 * Validates that a webhook URL is HTTPS and does not resolve to a private or metadata address.
 */
export async function validateWebhookUrl(urlString: string): Promise<{ valid: boolean; reason?: string }> {
  try {
    const url = new URL(urlString);

    if (url.protocol !== "https:") {
      // In strict environments, block non-HTTPS webhooks
      return { valid: false, reason: "Webhook URL must use HTTPS." };
    }

    const hostname = url.hostname.toLowerCase();

    // Direct localhost/metadata keywords
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "169.254.169.254" ||
      hostname === "metadata.google.internal"
    ) {
      return { valid: false, reason: "Webhook destination points to a restricted host." };
    }

    // Resolve DNS to verify the destination IP is not private
    try {
      const addresses = await dns.lookup(hostname, { all: true });
      for (const addr of addresses) {
        if (isPrivateIp(addr.address)) {
          return {
            valid: false,
            reason: `Webhook destination resolves to a private IP range (${addr.address}).`,
          };
        }
      }
    } catch (dnsErr) {
      return { valid: false, reason: `DNS lookup failed for webhook host: ${hostname}` };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: "Invalid webhook URL format." };
  }
}

/**
 * Dispatches a securely signed JSON webhook.
 */
export async function dispatchSignedWebhook(
  url: string,
  payload: Record<string, any>,
  signingSecret?: string
): Promise<{ success: boolean; status?: number; error?: string }> {
  const validation = await validateWebhookUrl(url);
  if (!validation.valid) {
    logger.warn("webhook dispatch rejected by SSRF guard", { url, reason: validation.reason });
    return { success: false, error: validation.reason };
  }

  try {
    const rawBody = JSON.stringify(payload);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "IceCream-Validator-Webhook/2.0",
      "X-IceCream-Timestamp": new Date().toISOString(),
    };

    if (signingSecret) {
      const signature = crypto
        .createHmac("sha256", signingSecret)
        .update(rawBody)
        .digest("hex");
      headers["X-IceCream-Signature"] = `sha256=${signature}`;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: rawBody,
      signal: AbortSignal.timeout(10000),
    });

    logger.info("webhook dispatched", { url, status: res.status, ok: res.ok });
    return { success: res.ok, status: res.status };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn("webhook dispatch failed", { url, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}
