import type { ReportSummary } from "@repo/shared";
import { pool } from "../db.js";
import { logger } from "../logger.js";

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

/**
 * Sends a transactional email using Resend if configured, or logs if in local dev.
 */
async function sendEmail(payload: EmailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.info("RESEND_API_KEY not set — logging notification to console", {
      recipient: payload.to,
      subject: payload.subject,
    });
    return;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "AI Idea Validator <onboarding@resend.dev>",
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.warn("failed to send notification email via Resend", { status: res.status, error: errText });
    } else {
      logger.info("completion notification email dispatched via Resend", { recipient: payload.to });
    }
  } catch (err) {
    logger.warn("error calling Resend API", { error: String(err) });
  }
}

/**
 * Sends the completion notification email to the job creator.
 */
export async function notifyJobCompletion(options: {
  jobId: string;
  userId: string;
  ideaText: string;
  report: ReportSummary;
}): Promise<void> {
  try {
    // Look up creator's email address in auth.users
    const { rows } = await pool.query<{ email: string }>(
      `SELECT email FROM auth.users WHERE id = $1`,
      [options.userId]
    );

    const userEmail = rows[0]?.email;
    if (!userEmail) {
      logger.warn("creator email not found in auth.users", { userId: options.userId });
      return;
    }

    const appUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const reportUrl = `${appUrl}/jobs/${options.jobId}`;
    const truncatedIdea =
      options.ideaText.length > 60
        ? `${options.ideaText.slice(0, 60)}...`
        : options.ideaText;

    const subject = `Simulation Ready: "${truncatedIdea}"`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #171717;">
        <h1 style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">Your Validation Report is Ready</h1>
        <p style="color: #737373; font-size: 14px; margin-top: 0;">Idea: "${options.ideaText}"</p>
        
        <div style="background-color: #f5f5f5; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="font-size: 13px; text-transform: uppercase; color: #737373; margin: 0 0 4px 0; font-weight: 600;">Executive Verdict</p>
          <p style="font-size: 16px; font-weight: 600; margin: 0; color: #0a0a0a;">${options.report.headline}</p>
          
          <div style="margin-top: 14px; padding-top: 14px; border-top: 1px solid #e5e5e5; display: flex; justify-content: space-between;">
            <div>
              <span style="font-size: 12px; color: #737373;">Simulated Interest Range</span>
              <p style="font-size: 18px; font-weight: 700; margin: 2px 0 0 0;">${options.report.overallAdoptionLow}% – ${options.report.overallAdoptionHigh}%</p>
            </div>
            <div>
              <span style="font-size: 12px; color: #737373;">Panel Tested</span>
              <p style="font-size: 18px; font-weight: 700; margin: 2px 0 0 0;">${options.report.panelSizeEffective} Personas</p>
            </div>
          </div>
        </div>

        <p style="font-size: 14px; margin: 24px 0;">
          The simulated focus group has finished their deliberation across all debate rounds. You can review the full dialogue, market segment breakdown, and key dealbreakers online:
        </p>

        <a href="${reportUrl}" style="display: inline-block; background-color: #171717; color: #ffffff; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 600; text-decoration: none;">
          View Full Validation Report &rarr;
        </a>
      </div>
    `;

    await sendEmail({
      to: userEmail,
      subject,
      html,
    });
  } catch (err) {
    logger.warn("notifyJobCompletion encountered an error", { error: String(err) });
  }
}
