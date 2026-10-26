import { requireUser } from "@/lib/auth";
import { getInterviewUrl } from "@/lib/interview-url";
import { logger } from "@/lib/logger";
import { InterviewService } from "@/services/interviews.service";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";

const base_url = process.env.NEXT_PUBLIC_LIVE_URL;

export async function POST(req: Request) {
  const { user, error } = await requireUser();
  if (error) {
    return error;
  }

  try {
    const url_id = nanoid();
    const origin = new URL(req.url).origin;
    const url = getInterviewUrl(url_id, base_url || origin, origin);
    const body = await req.json();

    logger.info("create-interview request received");

    const payload = body.interviewData;

    let readableSlug = null;
    if (body.organizationName) {
      const interviewNameSlug = payload.name?.toLowerCase().replace(/\s/g, "-");
      const orgNameSlug = body.organizationName?.toLowerCase().replace(/\s/g, "-");
      readableSlug = `${orgNameSlug}-${interviewNameSlug}`;
    }

    await InterviewService.createInterview({
      ...payload,
      // Ownership comes from the session, never from the request body.
      user_id: user.userId,
      organization_id: user.orgId,
      url: url,
      id: url_id,
      readable_slug: readableSlug,
    });

    logger.info("Interview created successfully");

    return NextResponse.json({ response: "Interview created successfully" }, { status: 200 });
  } catch (err) {
    logger.error("Error creating interview");

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
