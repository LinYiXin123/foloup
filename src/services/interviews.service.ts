import { createServiceClient } from "@/lib/supabase";

const supabase = createServiceClient();

const normalizeInterviewPayload = (payload: any) => {
  const id = payload?.interviewer_id;
  if (id === undefined || id === null) {
    return payload;
  }
  if (String(id) === "0") {
    return { ...payload, interviewer_id: null };
  }

  return payload;
};

const getAllInterviews = async (userId: string, organizationId: string, archived = false) => {
  // Without an org, match on the user only: an empty org id would match every
  // other org-less user's interviews.
  const ownerFilter = organizationId
    ? `organization_id.eq.${organizationId},user_id.eq.${userId}`
    : `user_id.eq.${userId}`;
  const query = supabase.from("interview").select("*").or(ownerFilter);
  // A second .or() would replace the ownership filter. Keep the archive
  // condition separate and include legacy NULL flags in the normal list.
  const filtered = archived ? query.eq("is_archived", true) : query.not("is_archived", "is", true);
  const { data, error } = await filtered.order("created_at", { ascending: false });
  if (error) {
    throw error;
  }
  return data || [];
};

const getInterviewById = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from("interview")
      .select("*")
      .or(`id.eq.${id},readable_slug.eq.${id}`);

    return data ? data[0] : null;
  } catch (error) {
    console.log(error);

    return [];
  }
};

const updateInterview = async (payload: any, id: string) => {
  const normalizedPayload = normalizeInterviewPayload(payload);
  const { error, data } = await supabase
    .from("interview")
    .update({ ...normalizedPayload })
    .eq("id", id);
  if (error) {
    throw error;
  }

  return data;
};

const deleteInterview = async (id: string) => {
  const { error, data } = await supabase
    .from("interview")
    .update({ is_archived: true, is_active: false })
    .eq("id", id)
    .select("id")
    .single();
  if (error) {
    throw error;
  }

  return data;
};

const restoreInterview = async (id: string) => {
  const { error, data } = await supabase
    .from("interview")
    .update({ is_archived: false, is_active: false })
    .eq("id", id)
    .select("id")
    .single();
  if (error) {
    throw error;
  }
  return data;
};

const getAllRespondents = async (interviewId: string) => {
  try {
    const { data, error } = await supabase
      .from("interview")
      .select("respondents")
      .eq("interview_id", interviewId);

    return data || [];
  } catch (error) {
    console.log(error);

    return [];
  }
};

const createInterview = async (payload: any) => {
  const normalizedPayload = normalizeInterviewPayload(payload);
  const { error, data } = await supabase.from("interview").insert({ ...normalizedPayload });
  if (error) {
    throw error;
  }

  return data;
};

const deactivateInterviewsByOrgId = async (organizationId: string) => {
  try {
    const { error } = await supabase
      .from("interview")
      .update({ is_active: false })
      .eq("organization_id", organizationId)
      .eq("is_active", true); // Optional: only update if currently active

    if (error) {
      console.error("Failed to deactivate interviews:", error);
    }
  } catch (error) {
    console.error("Unexpected error disabling interviews:", error);
  }
};

export const InterviewService = {
  getAllInterviews,
  getInterviewById,
  updateInterview,
  deleteInterview,
  restoreInterview,
  getAllRespondents,
  createInterview,
  deactivateInterviewsByOrgId,
};
