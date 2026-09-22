import { env } from "@/server/env";

/**
 * Narrative layer for the AI Executive Brief.
 *
 * The numbers, the sections and the recommendations are always computed by the
 * deterministic engine from the tenant's own rows — the LLM never sees the
 * database and never invents a figure. What it can do, when `AI_ENGINE="llm"` and
 * a provider key is configured, is rephrase the prose around those fixed facts.
 *
 * When the provider is not configured, unreachable, slow or answers with junk,
 * the deterministic narrative is used unchanged and the caller records which
 * engine actually produced the text. Nothing is ever silently simulated: the
 * brief stores `engine` and `model`, so a reader can tell exactly who wrote it.
 */
export type NarrativeEngine = {
  /** Short identifier persisted on the brief row. */
  engine: string;
  /** Provider model name, when an LLM was used. */
  model: string | null;
};

export type NarrativeRequest = {
  headline: string;
  facts: { label: string; value: string; detail?: string }[];
  sections: { title: string; body: string }[];
  /** Tone guidance for the model; the facts themselves stay untouched. */
  audience: string;
};

const TIMEOUT_MS = 12_000;

export function narrativeEngine(): NarrativeEngine {
  const configured = env.AI_ENGINE === "llm" && Boolean(env.OPENAI_API_KEY);
  return {
    engine: configured ? `openai-${env.OPENAI_MODEL}` : "nexus-deterministic-v1",
    model: configured ? env.OPENAI_MODEL : null,
  };
}

/**
 * Rephrases the brief with the configured LLM. Returns the original sections when
 * the provider is unavailable — the caller keeps the deterministic text and its
 * own engine label, so a degraded run is visible rather than hidden.
 */
export async function narrate(request: NarrativeRequest): Promise<{
  sections: { title: string; body: string }[];
  used: NarrativeEngine;
  degradedReason?: string;
}> {
  const target = narrativeEngine();
  const deterministic = { sections: request.sections, used: { engine: "nexus-deterministic-v1", model: null } };

  if (target.model === null || !env.OPENAI_API_KEY) return deterministic;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You rewrite executive briefings for a revenue intelligence platform. " +
              "Reuse only the facts given to you, keep every number, currency amount and entity name " +
              "exactly as provided, never add or estimate a figure, and answer with JSON " +
              '{"sections":[{"title":string,"body":string}]} in the same order as the input.',
          },
          {
            role: "user",
            content: JSON.stringify({
              audience: request.audience,
              headline: request.headline,
              facts: request.facts,
              sections: request.sections,
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      return { ...deterministic, degradedReason: `provider responded ${response.status}` };
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = payload.choices?.[0]?.message?.content;
    if (!raw) return { ...deterministic, degradedReason: "provider returned an empty completion" };

    const parsed = JSON.parse(raw) as { sections?: { title?: string; body?: string }[] };
    const rewritten = (parsed.sections ?? [])
      .filter((section) => typeof section?.body === "string" && section.body.trim().length > 0)
      .map((section, index) => ({
        title: request.sections[index]?.title ?? section.title ?? "Brief",
        body: section.body!.trim(),
      }));

    if (rewritten.length !== request.sections.length) {
      return { ...deterministic, degradedReason: "provider dropped sections" };
    }

    return { sections: rewritten, used: target };
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError" ? "provider timed out" : "provider unreachable";
    return { ...deterministic, degradedReason: reason };
  } finally {
    clearTimeout(timeout);
  }
}
