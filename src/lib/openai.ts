import { OpenAI } from "openai";

export function createOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
    maxRetries: 5,
  });
}

export function getOpenAIModel() {
  return process.env.OPENAI_MODEL || "gpt-4o";
}
