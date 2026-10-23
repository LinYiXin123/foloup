"use server";

// Data access for the signed-in dashboard. Server actions are public HTTP endpoints,
// so every function checks the Clerk session and takes user and org ids from it,
// never from its arguments.

import { canAccessInterview, getSignedInUser } from "@/lib/auth";
import { reconcileInterviewCalls } from "@/services/call-reconciliation.service";
import { ClientService } from "@/services/clients.service";
import { InterviewerService } from "@/services/interviewers.service";
import { InterviewService } from "@/services/interviews.service";
import { ResponseService } from "@/services/responses.service";
import type { Interview } from "@/types/interview";
import { clerkClient, currentUser } from "@clerk/nextjs/server";

// Columns that decide who owns an interview or where its link points; never editable.
const PROTECTED_INTERVIEW_FIELDS = ["id", "user_id", "organization_id", "url", "readable_slug"];

async function getOwnedInterview(interviewId: string) {
  const user = await getSignedInUser();
  const interview: Interview | null = await InterviewService.getInterviewById(interviewId);
  if (!canAccessInterview(interview, user)) {
    throw new Error("Interview not found");
  }

  return interview as Interview;
}

async function getOwnedResponse(callId: string) {
  const response = await ResponseService.getResponseByCallId(callId);
  if (!response) {
    throw new Error("Response not found");
  }
  await getOwnedInterview(response.interview_id);

  return response;
}

export async function syncCurrentUser() {
  const user = await getSignedInUser();
  const clerkUser = await currentUser();

  return ClientService.getClientById(
    user.userId,
    clerkUser?.emailAddresses[0]?.emailAddress ?? null,
    user.orgId || null,
  );
}

export async function getMyOrganization() {
  const user = await getSignedInUser();
  if (!user.orgId) {
    return null;
  }
  const clerk = await clerkClient();
  const organization = await clerk.organizations.getOrganization({ organizationId: user.orgId });

  return ClientService.getOrganizationById(user.orgId, organization.name);
}

export async function getMyOrganizationResponseCount() {
  const user = await getSignedInUser();
  if (!user.orgId) {
    return 0;
  }

  return ResponseService.getResponseCountByOrganizationId(user.orgId);
}

export async function endMyOrganizationFreeTrial() {
  const user = await getSignedInUser();
  if (!user.orgId) {
    return;
  }
  await InterviewService.deactivateInterviewsByOrgId(user.orgId);
  await ClientService.updateOrganization({ plan: "free_trial_over" }, user.orgId);
}

export async function getMyInterviews() {
  const user = await getSignedInUser();

  return InterviewService.getAllInterviews(user.userId, user.orgId);
}

export async function getMyInterview(interviewId: string) {
  return getOwnedInterview(interviewId);
}

export async function updateMyInterview(interviewId: string, payload: Record<string, unknown>) {
  const interview = await getOwnedInterview(interviewId);
  const changes = Object.fromEntries(
    Object.entries(payload).filter(([key]) => !PROTECTED_INTERVIEW_FIELDS.includes(key)),
  );

  return InterviewService.updateInterview(changes, interview.id);
}

export async function deleteMyInterview(interviewId: string) {
  const interview = await getOwnedInterview(interviewId);

  return InterviewService.deleteInterview(interview.id);
}

export async function getMyInterviewResponses(interviewId: string) {
  const interview = await getOwnedInterview(interviewId);
  await reconcileInterviewCalls(interview.id);

  return ResponseService.getAllResponses(interview.id);
}

export async function getMyResponse(callId: string) {
  return getOwnedResponse(callId);
}

export async function updateMyResponse(
  callId: string,
  payload: { candidate_status?: string; is_viewed?: boolean },
) {
  await getOwnedResponse(callId);
  const changes: { candidate_status?: string; is_viewed?: boolean } = {};
  if (typeof payload.candidate_status === "string") {
    changes.candidate_status = payload.candidate_status;
  }
  if (typeof payload.is_viewed === "boolean") {
    changes.is_viewed = payload.is_viewed;
  }

  return ResponseService.updateResponse(changes, callId);
}

export async function deleteMyResponse(callId: string) {
  await getOwnedResponse(callId);

  return ResponseService.deleteResponse(callId);
}

export async function getInterviewers() {
  await getSignedInUser();

  return InterviewerService.getAllInterviewers();
}

export async function createCustomInterviewer(payload: {
  name: string;
  empathy: number;
  rapport: number;
  exploration: number;
  speed: number;
  image: string;
}) {
  const user = await getSignedInUser();

  return InterviewerService.createInterviewer({
    name: payload.name,
    empathy: payload.empathy,
    rapport: payload.rapport,
    exploration: payload.exploration,
    speed: payload.speed,
    image: payload.image,
    user_id: user.userId,
  });
}
