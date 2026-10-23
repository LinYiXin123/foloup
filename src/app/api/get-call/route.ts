import { canAccessInterview, requireUser } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { generateInterviewAnalytics } from "@/services/analytics.service";
import { InterviewService } from "@/services/interviews.service";
import { ResponseService } from "@/services/responses.service";
import type { Response } from "@/types/response";
import { NextResponse } from "next/server";
import Retell from "retell-sdk";

const retell = new Retell({
  apiKey: process.env.RETELL_API_KEY || "",
});

export async function POST(req: Request) {
  logger.info("get-call request received");
  const { user, error } = await requireUser();
  if (error) {
    return error;
  }
  const body = await req.json();

  const callDetails: Response = await ResponseService.getResponseByCallId(body.id);
  // Transcripts are candidate data: only the interview's owner may read them.
  const ownerInterview = callDetails
    ? await InterviewService.getInterviewById(callDetails.interview_id)
    : null;
  if (!canAccessInterview(ownerInterview, user)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  let callResponse = callDetails.details;
  if (callDetails.is_analysed && callDetails.analytics) {
    return NextResponse.json(
      {
        callResponse,
        analytics: callDetails.analytics,
      },
      { status: 200 },
    );
  }
  const callOutput = await retell.call.retrieve(body.id);
  if (callOutput.call_status !== "ended" || !callOutput.transcript?.trim()) {
    return NextResponse.json(
      { error: "The interview must finish and have a transcript before it can be analysed." },
      { status: 409 },
    );
  }
  if (
    typeof callOutput.start_timestamp !== "number" ||
    typeof callOutput.end_timestamp !== "number" ||
    !Number.isFinite(callOutput.start_timestamp) ||
    !Number.isFinite(callOutput.end_timestamp) ||
    callOutput.end_timestamp < callOutput.start_timestamp
  ) {
    return NextResponse.json({ error: "Call timing is not ready yet." }, { status: 409 });
  }
  const interviewId = callDetails?.interview_id;
  callResponse = callOutput;
  const duration = Math.round(
    callResponse.end_timestamp / 1000 - callResponse.start_timestamp / 1000,
  );

  const payload = {
    callId: body.id,
    interviewId: interviewId,
    transcript: callResponse.transcript,
  };
  const result = await generateInterviewAnalytics(payload);
  if (result.status !== 200 || !result.analytics) {
    logger.error("Call analysis failed; the response remains available for retry");

    return NextResponse.json(
      { error: "Could not analyse the interview. Please try again." },
      { status: 502 },
    );
  }

  const analytics = result.analytics;

  await ResponseService.saveResponse(
    {
      details: callResponse,
      is_ended: true,
      is_analysed: true,
      duration: duration,
      analytics: analytics,
    },
    body.id,
  );

  logger.info("Call analysed successfully");

  return NextResponse.json(
    {
      callResponse,
      analytics,
    },
    { status: 200 },
  );
}
