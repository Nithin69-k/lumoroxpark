import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const PROVIDER = process.env.AI_PROVIDER || "gemini";
const API_KEY = process.env.AI_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
const GEMINI_MODEL = process.env.AI_GEMINI_MODEL || "gemini-1.5-flash";
const OPENAI_MODEL = process.env.AI_OPENAI_MODEL || "gpt-4o-mini";

export function isAiConfigured(): boolean {
  return Boolean(API_KEY);
}

export function getAiProvider(): string {
  return API_KEY ? PROVIDER : "none";
}

async function geminiComplete(system: string, user: string, json: boolean): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2048,
          ...(json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let detail = body.slice(0, 200);
    try {
      const err = JSON.parse(body) as { code?: number; error_code?: string; msg?: string };
      if (err.msg) {
        detail = err.msg;
        if (/not enabled|unsupported provider/i.test(detail)) {
          detail +=
            " — enable the Generative Language API for your API key's project, or set AI_GEMINI_MODEL to a model your key supports (e.g. gemini-2.0-flash).";
        }
      }
    } catch {
      // keep the raw body as-is
    }
    throw new Error(`AI provider error (${res.status}): ${detail}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("AI provider returned an empty response");
  return text;
}

async function openaiComplete(system: string, user: string, json: boolean): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.3,
      max_tokens: 2048,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AI provider error (${res.status})${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("AI provider returned an empty response");
  return text;
}

async function complete(system: string, user: string, json: boolean): Promise<string> {
  if (!API_KEY) throw new Error("AI is not configured yet");
  const fn = PROVIDER === "openai" ? openaiComplete : geminiComplete;
  return fn(system, user, json);
}

function extractJson(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("AI did not return valid JSON");
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

/** Runs a natural-language prompt and parses the model's JSON answer. */
export async function completeJson<T>(system: string, user: string): Promise<T> {
  const text = await complete(system, user, true);
  return extractJson(text) as T;
}

/** Runs a natural-language prompt and returns the model's text answer. */
export async function completeText(system: string, user: string): Promise<string> {
  return complete(system, user, false);
}

/** Anonymous Supabase client for public RPCs called from AI server functions. */
export function getPublicClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Free OpenStreetMap geocoder used to turn "near the airport" into coordinates. */
export async function geocodeLocation(
  query: string,
): Promise<{ lat: number; lng: number; label: string } | null> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
    { headers: { "User-Agent": "LumoroXPark/1.0 (parking marketplace)" } },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  const row = rows[0];
  if (!row) return null;
  return { lat: Number(row.lat), lng: Number(row.lon), label: row.display_name };
}
