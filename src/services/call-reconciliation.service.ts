import "server-only";

import { logger } from "@/lib/logger";
import { ResponseService } from "@/services/responses.service";
import Retell from "retell-sdk";

const RECONCILIATION_TIMEOUT_MS = 8_000;
const retell = new Retell({
  apiKey: process.env.RETELL_API_KEY || "",
  timeout: RECONCILIATION_TIMEOUT_MS,
  maxRetries: 0,
});

// The caller must first verify ownership of this interview. A closed candidate tab
// cannot report call_ended, so the provider is the source of truth on dashboard refresh.
export async function reconcileInterviewCalls(interviewId: string) {
  let pendingCalls: { call_id: string }[];
  try {
    pendingCalls = await ResponseService.getPendingCalls(interviewId);
  } catch {
    logger.warn("Could not check pending interview calls; they remain available for retry");

    return;
  }
  if (pendingCalls.length === 0) {
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RECONCILIATION_TIMEOUT_MS);
  let nextIndex = 0;

  try {
    await Promise.all(
      Array.from({ length: Math.min(4, pendingCalls.length) }, async () => {
        while (!controller.signal.aborted && nextIndex < pendingCalls.length) {
          const { call_id: callId } = pendingCalls[nextIndex++];
          if (!callId) {
            continue;
          }
          try {
            const call = await retell.call.retrieve(callId, { signal: controller.signal });
            if (call.call_status !== "ended") {
              continue;
            }

            const payload: { is_ended: true; duration?: number } = { is_ended: true };
            if (
              typeof call.start_timestamp === "number" &&
              typeof call.end_timestamp === "number" &&
              Number.isFinite(call.start_timestamp) &&
              Number.isFinite(call.end_timestamp) &&
              call.end_timestamp >= call.start_timestamp
            ) {
              payload.duration = Math.round((call.end_timestamp - call.start_timestamp) / 1000);
            }
            await ResponseService.saveResponse(payload, callId);
          } catch {
            logger.warn("Could not reconcile a pending call; it remains available for retry");
          }
        }
      }),
    );
  } finally {
    clearTimeout(timeout);
  }
}
