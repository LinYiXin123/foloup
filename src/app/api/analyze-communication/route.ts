import { requireUser } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { createOpenAIClient, getOpenAIModel } from "@/lib/openai";
import {
  SYSTEM_PROMPT,
  getCommunicationAnalysisPrompt,
} from "@/lib/prompts/communication-analysis";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  logger.info("analyze-communication request received");
  const { error } = await requireUser();
  if (error) {
    return error;
  }

  try {
    const body = await req.json();
    const { transcript } = body;

    if (!transcript) {
      return NextResponse.json({ error: "Transcript is required" }, { status: 400 });
    }

    const openai = createOpenAIClient();

    const completion = await openai.chat.completions.create({
      model: getOpenAIModel(),
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: getCommunicationAnalysisPrompt(transcript),
        },
      ],
      response_format: { type: "json_object" },
    });

    const analysis = completion.choices[0]?.message?.content;

    logger.info("Communication analysis completed successfully");

    return NextResponse.json({ analysis: JSON.parse(analysis || "{}") }, { status: 200 });
  } catch (error) {
    logger.error("Error analyzing communication skills");

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
