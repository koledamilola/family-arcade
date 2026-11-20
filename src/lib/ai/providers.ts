import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Talks to whichever AI service the family's parent connected.
// One shape in (system prompt + messages), one shape out (text + tokens + cost),
// so the rest of the app doesn't care which company is behind it.

export type Provider = "openrouter" | "anthropic" | "openai" | "google";

export const PROVIDERS: Record<
  Provider,
  { label: string; company: string; keyUrl: string; keyLooksLike: RegExp; steps: string[] }
> = {
  openrouter: {
    label: "OpenRouter",
    company: "OpenRouter",
    keyUrl: "https://openrouter.ai/settings/keys",
    keyLooksLike: /^sk-or-/,
    steps: ["Sign in to OpenRouter", "Add some credit (Credits page)", "Create a key and paste it here"],
  },
  anthropic: {
    label: "Claude",
    company: "Anthropic",
    keyUrl: "https://platform.claude.com/settings/keys",
    keyLooksLike: /^sk-ant-/,
    steps: ["Sign in to the Claude Console", "Add credit under Billing", "Create an API key and paste it here"],
  },
  openai: {
    label: "ChatGPT / OpenAI",
    company: "OpenAI",
    keyUrl: "https://platform.openai.com/api-keys",
    keyLooksLike: /^sk-/,
    steps: ["Sign in to the OpenAI Platform", "Add credit under Billing", "Create a secret key and paste it here"],
  },
  google: {
    label: "Gemini",
    company: "Google",
    keyUrl: "https://aistudio.google.com/apikey",
    keyLooksLike: /^AIza/,
    steps: ["Sign in to Google AI Studio", "Click Create API key", "Paste the key here"],
  },
};

/**
 * Two jobs, two price points, to make credit last:
 *  - "build": writes or rewrites the game's code. Needs a strong coding model.
 *  - "coach": asks questions, plans, explains. A small fast model is plenty.
 * Build models are listed best first; for OpenAI/Gemini keys we use the first one the key can access.
 */
const PREFERRED_MODELS: Record<Provider, string[]> = {
  openrouter: ["anthropic/claude-sonnet-5.5"],
  anthropic: ["claude-sonnet-5-5"],
  openai: ["gpt-6.1-terra", "gpt-6.2-sol", "gpt-6.1-sol"],
  google: ["gemini-4-hydrogen", "gemini-4-carbon", "gemini-4-argon"],
};

/** The cheap coach model, with prices (USD per 1M tokens). OpenAI/Gemini keys coach with the build model. */
const COACH_MODELS: Partial<Record<Provider, { model: string; price_in: number; price_out: number }>> = {
  openrouter: { model: "anthropic/claude-haiku-5.5", price_in: 0.1, price_out: 0.5 },
  anthropic: { model: "claude-haiku-5-5", price_in: 0.1, price_out: 0.5 },
};

export type Tier = "build" | "coach";

/** Which model (and price) to use for a job, given the family's connection. */
export function modelFor(provider: Provider, buildModel: string, buildPrices: { price_in: number; price_out: number }, tier: Tier) {
  const coach = COACH_MODELS[provider];
  if (tier === "coach" && coach) return coach;
  return { model: buildModel, ...buildPrices };
}

/** OpenRouter's public catalog has per-token prices for every provider's models. */
async function catalogPrice(openRouterId: string) {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", { next: { revalidate: 86_400 } });
    const json = (await res.json()) as { data: { id: string; pricing: { prompt: string; completion: string } }[] };
    const m = json.data.find((x) => x.id === openRouterId);
    if (m) return { price_in: Number(m.pricing.prompt) * 1e6, price_out: Number(m.pricing.completion) * 1e6 };
  } catch {}
  return null;
}

function friendly(status: number, company: string) {
  if (status === 401 || status === 403) return `${company} says that key isn't valid. Check you copied all of it.`;
  if (status === 402) return `Your ${company} account is out of credit. Add some and try again.`;
  if (status === 429) return `${company} is busy or your account hit its rate limit. Try again in a minute.`;
  return `${company} had a problem (error ${status}). Try again in a minute.`;
}

export type VerifiedKey = { model: string; price_in: number; price_out: number };

/** Checks a key works and picks the model to build games with. Throws a parent-friendly message if not. */
export async function verifyKey(provider: Provider, key: string): Promise<VerifiedKey> {
  const company = PROVIDERS[provider].company;
  const timeout = AbortSignal.timeout(20_000);

  if (provider === "openrouter") {
    const res = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${key}` }, signal: timeout });
    if (!res.ok) throw new Error(friendly(res.status, company));
    const model = PREFERRED_MODELS.openrouter[0];
    return { model, ...((await catalogPrice(model)) ?? { price_in: 2, price_out: 10 }) };
  }

  if (provider === "anthropic") {
    const client = new Anthropic({ apiKey: key, maxRetries: 0, timeout: 20_000 });
    try {
      await client.models.retrieve(PREFERRED_MODELS.anthropic[0]);
    } catch (e) {
      if (e instanceof Anthropic.APIError) throw new Error(friendly(e.status ?? 500, company));
      throw new Error(`Couldn't reach ${company}. Check your internet connection and try again.`);
    }
    return { model: PREFERRED_MODELS.anthropic[0], price_in: 2, price_out: 10 };
  }

  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` }, signal: timeout });
    if (!res.ok) throw new Error(friendly(res.status, company));
    const ids = new Set(((await res.json()) as { data: { id: string }[] }).data.map((m) => m.id));
    const model = PREFERRED_MODELS.openai.find((m) => ids.has(m));
    if (!model) throw new Error("That OpenAI key can't use the models Family Arcade needs. Check the key's project permissions.");
    return { model, ...((await catalogPrice(`openai/${model}`)) ?? { price_in: 2, price_out: 10 }) };
  }

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${encodeURIComponent(key)}`, { signal: timeout });
  if (!res.ok) throw new Error(friendly(res.status === 400 ? 401 : res.status, company));
  const ids = new Set(((await res.json()) as { models?: { name: string }[] }).models?.map((m) => m.name.replace(/^models\//, "")) ?? []);
  const model = PREFERRED_MODELS.google.find((m) => ids.has(m));
  if (!model) throw new Error("That Gemini key can't use the models Family Arcade needs.");
  return { model, ...((await catalogPrice(`google/${model}`)) ?? { price_in: 2, price_out: 10 }) };
}

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ChatRequest = {
  /** "coach" for questions and planning (cheap model), "build" for writing game code. */
  tier: Tier;
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  /** How hard the model should think. "low" for quick questions, "high" for writing a game. */
  effort: "low" | "medium" | "high";
  /** Called with the full text written so far, as it streams in (for progress bars). */
  onText?: (soFar: string) => void;
};
export type ChatResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  /** True when the answer was cut off by maxTokens. */
  truncated: boolean;
};

const APP_HEADERS = { "HTTP-Referer": "https://koletek.vercel.app", "X-Title": "Family Arcade" };

/** Reads a server-sent-events response and yields each `data:` payload as parsed JSON. */
async function* sse(res: Response): AsyncGenerator<Record<string, unknown>> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        yield JSON.parse(data);
      } catch {}
    }
  }
}

/**
 * Sends one request and streams the answer. `costUsd` is null when the provider
 * doesn't report it (the caller then prices it from the token counts).
 */
export async function chat(provider: Provider, key: string, model: string, req: ChatRequest): Promise<ChatResult> {
  const company = PROVIDERS[provider].company;
  const timeout = AbortSignal.timeout(290_000);
  let text = "";
  const add = (piece: string | undefined | null) => {
    if (!piece) return;
    text += piece;
    req.onText?.(text);
  };

  if (provider === "anthropic") {
    const client = new Anthropic({ apiKey: key, maxRetries: 1 });
    try {
      const stream = client.beta.messages.stream(
        {
          model,
          max_tokens: req.maxTokens,
          system: req.system,
          messages: req.messages,
          output_config: { effort: req.effort },
          // Server-side refusal fallback (not offered for Haiku models).
          ...(model.includes("haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
        },
        { signal: timeout },
      );
      stream.on("text", (delta) => add(delta));
      const message = await stream.finalMessage();
      if (message.stop_reason === "refusal") throw new Error("The AI couldn't help with that request. Try describing the game differently.");
      return {
        text,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        costUsd: null,
        truncated: message.stop_reason === "max_tokens",
      };
    } catch (e) {
      if (e instanceof Anthropic.APIError) throw new Error(friendly(e.status ?? 500, company));
      throw e;
    }
  }

  if (provider === "google") {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: timeout,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: req.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
          generationConfig: { maxOutputTokens: req.maxTokens },
        }),
      },
    );
    if (!res.ok || !res.body) throw new Error(friendly(res.status, company));
    let usage: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } = {};
    let finish = "";
    for await (const chunk of sse(res)) {
      const c = chunk as {
        candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
        usageMetadata?: typeof usage;
      };
      for (const part of c.candidates?.[0]?.content?.parts ?? []) if (!part.thought) add(part.text);
      if (c.candidates?.[0]?.finishReason) finish = c.candidates[0].finishReason;
      if (c.usageMetadata) usage = c.usageMetadata;
    }
    return {
      text,
      inputTokens: usage.promptTokenCount ?? 0,
      outputTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
      costUsd: null,
      truncated: finish === "MAX_TOKENS",
    };
  }

  // OpenRouter and OpenAI both speak the OpenAI chat format.
  const url = provider === "openrouter" ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.openai.com/v1/chat/completions";
  const body: Record<string, unknown> = {
    model,
    stream: true,
    messages: [{ role: provider === "openai" ? "developer" : "system", content: req.system }, ...req.messages],
  };
  if (provider === "openrouter") {
    body.max_tokens = req.maxTokens;
    body.reasoning = { effort: req.effort, exclude: true };
    body.usage = { include: true };
  } else {
    body.max_completion_tokens = req.maxTokens;
    body.reasoning_effort = req.effort;
    body.stream_options = { include_usage: true };
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, ...(provider === "openrouter" ? APP_HEADERS : {}) },
    signal: timeout,
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error(friendly(res.status, company));
  let usage: { prompt_tokens?: number; completion_tokens?: number; cost?: number } = {};
  let finish = "";
  for await (const chunk of sse(res)) {
    const c = chunk as {
      choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[];
      usage?: typeof usage;
      error?: { code?: number; message?: string };
    };
    if (c.error) throw new Error(friendly(Number(c.error.code) || 500, company));
    add(c.choices?.[0]?.delta?.content);
    if (c.choices?.[0]?.finish_reason) finish = c.choices[0].finish_reason;
    if (c.usage) usage = c.usage;
  }
  return {
    text,
    inputTokens: usage.prompt_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0,
    costUsd: typeof usage.cost === "number" ? usage.cost : null,
    truncated: finish === "length",
  };
}
