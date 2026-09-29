import { z } from "zod";
import type { Env } from "./env";

export const PROJECT_ASSISTANT_MODEL =
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const assistantResponseSchema = z.object({
  reply: z.string().trim().min(1).max(6000)
});

function modelPayload(result: unknown): unknown {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") {
    throw new Error("Workers AI returned an empty project-assistant response.");
  }

  const record = result as Record<string, unknown>;
  if (record.response !== undefined) return record.response;

  if (record.result && typeof record.result === "object") {
    const nested = record.result as Record<string, unknown>;
    if (nested.response !== undefined) return nested.response;
  }

  if (Array.isArray(record.choices)) {
    const first = record.choices[0] as Record<string, unknown> | undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    if (message?.content !== undefined) return message.content;
  }

  throw new Error("Workers AI returned an unsupported project-assistant response.");
}

function parseModelJson(payload: unknown): unknown {
  if (payload && typeof payload === "object") return payload;
  if (typeof payload !== "string") {
    throw new Error("Project assistant did not return structured JSON.");
  }

  const trimmed = payload
    .trim()
    .replace(/^\`\`\`(?:json)?\s*/i, "")
    .replace(/\s*\`\`\`$/, "");

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) {
      throw new Error("Project assistant did not return valid JSON.");
    }
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

export async function answerProjectAssistant(input: {
  env: Env;
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  context: unknown;
}): Promise<string> {
  if (!input.env.AI) {
    throw new Error("Workers AI is required for project conversation.");
  }

  const ai = input.env.AI as any;
  const response = await ai.run(PROJECT_ASSISTANT_MODEL, {
    messages: [
      {
        role: "system",
        content: [
          "You are Methodome speaking directly to a researcher about the research project currently open in Methodome.",
          "The supplied PROJECT STATE is authoritative. Stay inside it.",
          "Never invent study facts, dataset fields, mappings, results, completed actions, source material, or statistical outputs.",
          "Never calculate statistics yourself and never override Methodome's deterministic method-selection rules.",
          "If more than one defensible method remains, explain the scientific difference using only the supplied candidates and leave the choice to the researcher.",
          "If the researcher asks what to do next, explain the current next action in plain research language. If Methodome can handle it automatically, say that clearly. If a researcher decision is required, state exactly one concrete decision at a time.",
          "If the researcher asks to change or add a research aim, variable, design assumption, or analysis that is not already represented in PROJECT STATE, treat it as a requested change. Explain what would need to be reviewed or updated; do not claim the project was changed.",
          "Do not expose internal pipeline or implementation jargon unless the researcher asks for technical detail.",
          "Write concise prose by default. Prefer one to three short paragraphs. Avoid bullet lists unless the researcher explicitly asks for a list.",
          "Return JSON only as {reply:string}."
        ].join("\n")
      },
      ...input.history.slice(-8).map((item) => ({
        role: item.role,
        content: item.content.slice(0, 4000)
      })),
      {
        role: "user",
        content: [
          "PROJECT STATE",
          JSON.stringify(input.context),
          "",
          "RESEARCHER MESSAGE",
          input.message
        ].join("\n")
      }
    ],
    temperature: 0.1,
    max_tokens: 1200,
    response_format: { type: "json_object" }
  });

  const parsed = assistantResponseSchema.parse(
    parseModelJson(modelPayload(response))
  );
  return parsed.reply;
}
