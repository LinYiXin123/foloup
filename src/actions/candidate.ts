"use server";

// The only data a candidate (no account) can reach. Each action does one narrow thing
// and returns only what the interview page needs to render.

import { FeedbackService } from "@/services/feedback.service";
import { InterviewerService } from "@/services/interviewers.service";
import { InterviewService } from "@/services/interviews.service";
import { ResponseService } from "@/services/responses.service";
import type { Interview } from "@/types/interview";
import type { FeedbackData } from "@/types/response";

export type PublicInterview = Pick<
  Interview,
  | "id"
  | "name"
  | "description"
  | "time_duration"
  | "interviewer_id"
  | "is_active"
  | "is_anonymous"
  | "theme_color"
  | "logo_url"
>;

export async function getPublicInterview(interviewId: string): Promise<PublicInterview | null> {
  const interview: Interview | null = await InterviewService.getInterviewById(interviewId);
  if (!interview?.id) {
    return null;
  }

  return {
    id: interview.id,
    name: interview.name,
    description: interview.description,
    time_duration: interview.time_duration,
    interviewer_id: interview.interviewer_id,
    is_active: interview.is_active,
    is_anonymous: interview.is_anonymous,
    theme_color: interview.theme_color,
    logo_url: interview.logo_url,
  };
}

export async function getInterviewerImage(interviewerId: bigint) {
  const interviewer = await InterviewerService.getInterviewer(interviewerId);

  return (interviewer?.image as string | undefined) ?? "";
}

// The call id is only known to the candidate who started that call.
export async function markCallEnded(callId: string, tabSwitchCount: number) {
  const response = await ResponseService.getResponseByCallId(callId);
  if (!response || response.is_ended) {
    return;
  }
  await ResponseService.saveResponse(
    { is_ended: true, tab_switch_count: Math.max(0, Math.floor(Number(tabSwitchCount) || 0)) },
    callId,
  );
}

export async function submitInterviewFeedback(feedback: FeedbackData) {
  const interview = await InterviewService.getInterviewById(String(feedback.interview_id ?? ""));
  if (!interview?.id) {
    throw new Error("Interview not found");
  }

  return FeedbackService.submitFeedback({
    interview_id: interview.id,
    satisfaction: typeof feedback.satisfaction === "number" ? feedback.satisfaction : null,
    feedback: typeof feedback.feedback === "string" ? feedback.feedback.slice(0, 2000) : null,
    email: typeof feedback.email === "string" ? feedback.email.slice(0, 200) : null,
  });
}
