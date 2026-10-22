import { RETELL_AGENT_GENERAL_PROMPT } from "@/lib/constants";
import { logger } from "@/lib/logger";
import { InterviewService } from "@/services/interviews.service";
import { InterviewerService } from "@/services/interviewers.service";
import type { Question } from "@/types/interview";
import { NextResponse } from "next/server";
import Retell from "retell-sdk";

const retellClient = new Retell({
  apiKey: process.env.RETELL_API_KEY || "",
});

// Enough for a long resume while capping what one public request can add to the LLM context.
const MAX_RESUME_CHARS = 12000;

// Interviewers created before the resume feature still run the old prompt on Retell.
// Bring each agent's LLM up to date once per server process.
const syncedLlmIds = new Set<string>();

async function syncAgentPrompt(agentId: string) {
  const agent = await retellClient.agent.retrieve(agentId);
  if (agent.response_engine.type !== "retell-llm") {
    return;
  }
  const llmId = agent.response_engine.llm_id;
  if (syncedLlmIds.has(llmId)) {
    return;
  }
  const llm = await retellClient.llm.retrieve(llmId);
  if (llm.general_prompt !== RETELL_AGENT_GENERAL_PROMPT) {
    await retellClient.llm.update(llmId, { general_prompt: RETELL_AGENT_GENERAL_PROMPT });
    logger.info("Updated interviewer prompt on Retell");
  }
  syncedLlmIds.add(llmId);
}

export async function POST(req: Request) {
  logger.info("register-call request received");

  const body = await req.json();

  // This route is public (candidates have no account), so everything except the
  // candidate's own name and resume comes from the stored interview, not the request.
  const interview = await InterviewService.getInterviewById(String(body.interview_id ?? ""));
  if (!interview || !interview.is_active) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }

  const interviewer = await InterviewerService.getInterviewer(interview.interviewer_id);
  if (!interviewer?.agent_id) {
    return NextResponse.json({ error: "Interviewer not configured" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  const resume =
    typeof body.resume === "string" ? body.resume.trim().slice(0, MAX_RESUME_CHARS) : "";

  try {
    await syncAgentPrompt(interviewer.agent_id);
  } catch (error) {
    // The interview still works with the old prompt, just without resume tailoring.
    logger.error("Could not sync interviewer prompt");
  }

  const registerCallResponse = await retellClient.call.createWebCall({
    agent_id: interviewer.agent_id,
    retell_llm_dynamic_variables: {
      mins: String(interview.time_duration ?? ""),
      objective: interview.objective ?? "",
      questions: (interview.questions ?? []).map((q: Question) => q.question).join(", "),
      name: name || "not provided",
      resume: resume || "Not provided",
    },
  });

  logger.info("Call registered successfully");

  return NextResponse.json(
    {
      registerCallResponse,
    },
    { status: 200 },
  );
}
