import { createServiceClient } from "@/lib/supabase";

const supabase = createServiceClient();

const createResponse = async (payload: any) => {
  const { error, data } = await supabase
    .from("response")
    .insert({ ...payload })
    .select("id");

  if (error) {
    console.log(error);

    return [];
  }

  return data[0]?.id;
};

const saveResponse = async (payload: any, call_id: string) => {
  const { error, data } = await supabase
    .from("response")
    .update({ ...payload })
    .eq("call_id", call_id);
  if (error) {
    console.log(error);

    return [];
  }

  return data;
};

const getAllResponses = async (interviewId: string) => {
  try {
    const { data, error } = await supabase
      .from("response")
      .select("*")
      .eq("interview_id", interviewId)
      .eq("is_ended", true)
      .order("created_at", { ascending: false });

    return data || [];
  } catch (error) {
    console.log(error);

    return [];
  }
};

const getPendingCalls = async (interviewId: string) => {
  const { data, error } = await supabase
    .from("response")
    .select("call_id")
    .eq("interview_id", interviewId)
    .or("is_ended.is.null,is_ended.eq.false")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Could not load pending interview calls");
  }

  return data || [];
};

const getResponseCountByOrganizationId = async (organizationId: string): Promise<number> => {
  try {
    const { count, error } = await supabase
      .from("interview")
      .select("response(id)", { count: "exact", head: true }) // join + count
      .eq("organization_id", organizationId);

    return count ?? 0;
  } catch (error) {
    console.log(error);

    return 0;
  }
};

const getAllEmailAddressesForInterview = async (interviewId: string) => {
  try {
    const { data, error } = await supabase
      .from("response")
      .select("email")
      .eq("interview_id", interviewId);

    return data || [];
  } catch (error) {
    console.log(error);

    return [];
  }
};

const getResponseByCallId = async (id: string) => {
  try {
    const { data, error } = await supabase.from("response").select("*").filter("call_id", "eq", id);

    return data ? data[0] : null;
  } catch (error) {
    console.log(error);

    return [];
  }
};

const deleteResponse = async (id: string) => {
  const { error, data } = await supabase.from("response").delete().eq("call_id", id);
  if (error) {
    console.log(error);

    return [];
  }

  return data;
};

const updateResponse = async (payload: any, call_id: string) => {
  const { error, data } = await supabase
    .from("response")
    .update({ ...payload })
    .eq("call_id", call_id);
  if (error) {
    console.log(error);

    return [];
  }

  return data;
};

export const ResponseService = {
  createResponse,
  saveResponse,
  updateResponse,
  getAllResponses,
  getPendingCalls,
  getResponseByCallId,
  deleteResponse,
  getResponseCountByOrganizationId,
  getAllEmails: getAllEmailAddressesForInterview,
};
