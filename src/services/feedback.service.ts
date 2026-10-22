import { createServiceClient } from "@/lib/supabase";
import type { FeedbackData } from "@/types/response";

const supabase = createServiceClient();

const submitFeedback = async (feedbackData: FeedbackData) => {
  const { error, data } = await supabase.from("feedback").insert(feedbackData).select();

  if (error) {
    console.error("Error submitting feedback:", error);
    throw error;
  }

  return data;
};

export const FeedbackService = {
  submitFeedback,
};
