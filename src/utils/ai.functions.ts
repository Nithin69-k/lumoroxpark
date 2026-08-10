import { createServerFn } from "@tanstack/react-start";
import {
  completeJson,
  completeText,
  geocodeLocation,
  getPublicClient,
  isAiConfigured,
} from "@/lib/ai.server";
import type { SpaceResult } from "@/lib/search";

const MAX_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 2000;

export type AiChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AiAssistantResult = {
  reply: string;
  results: SpaceResult[];
  searchedFor: string | null;
};

const ASSISTANT_SYSTEM = `You are Lumoro AI, the friendly assistant for LumoroX Park, a marketplace
where people book private driveway parking by the hour.

You help in two ways:
1. Finding parking from natural language ("parking near Indiranagar tomorrow 3-6pm").
2. Answering questions about the platform.

About LumoroX Park:
- Drivers book parking by the hour. Hosts set an hourly price and publish a listing with a map pin.
- Bookings are confirmed only after the driver pays by UPI (scan the QR / pay the UPI ID shown, then
  enter the UPI transaction reference). Refunds follow the host's cancellation policy.
- Platform commission is 10% for free hosts, 5% for Host Pro. A $1 reservation fee applies per booking.
- Host Pro costs $19/month or $190/year: unlimited listings, featured placement, reduced commission.
- Hosts are paid out through an in-app wallet once the balance clears 24h after a stay; payouts are
  processed by the business via UPI.
- EV, covered, gated and camera features are listed per space.

Rules:
- Be warm and concise (max ~90 words for chat answers, ~120 for search answers).
- Never invent spaces, prices or policies. If you don't know, say so.
- When the user clearly wants to find parking, you MUST set needsSearch=true and extract the request.
  If the location is vague or missing, set needsSearch=false and ask where they want to park.
  Interpret relative times from today's date: ${new Date().toISOString()}.
  If no start time is given, default starts to the next full hour. If no end time is given, ask the
  user how long they need, and fall back to 2 hours when the intent is clear ("for the evening").
  Duration overrides are NOT allowed when both starts and ends are given — use the user's times.
- For general questions, set needsSearch=false and answer in directReply.`;

type AssistantIntent = {
  needsSearch: boolean;
  location: string | null;
  starts: string | null;
  ends: string | null;
  durationHours: number | null;
  radiusKm: number;
  covered: boolean | null;
  gated: boolean | null;
  ev: boolean | null;
  maxPrice: number | null;
  directReply: string;
};

/**
 * Lumoro AI assistant: parses a natural-language request, searches the
 * marketplace when the user wants parking, and answers platform questions.
 */
export const askLumoroAi = createServerFn({ method: "POST" })
  .inputValidator((data: { messages: AiChatMessage[] }) => data)
  .handler(async ({ data }): Promise<AiAssistantResult> => {
    const messages = data.messages.slice(-MAX_MESSAGES);
    const last = messages[messages.length - 1];
    if (!last || last.role !== "user") throw new Error("Nothing to ask");
    const query = last.content.trim();
    if (!query) throw new Error("Nothing to ask");
    if (query.length > MAX_MESSAGE_LENGTH) {
      throw new Error("That question is too long — please keep it under 2000 characters");
    }
    if (!isAiConfigured()) {
      throw new Error("Lumoro AI isn't configured yet — add AI_API_KEY to the server environment");
    }

    const history = messages
      .slice(0, -1)
      .map((m) => `${m.role === "user" ? "User" : "Lumoro AI"}: ${m.content}`)
      .join("\n");

    const intent = await completeJson<AssistantIntent>(
      ASSISTANT_SYSTEM,
      `Conversation so far:\n${history || "(none)"}\n\nLatest message from the user: "${query}"\n
Return JSON with exactly these keys:
{
  "needsSearch": boolean,
  "location": string|null,
  "starts": ISO string|null,
  "ends": ISO string|null,
  "durationHours": number|null,
  "radiusKm": number,
  "covered": boolean|null,
  "gated": boolean|null,
  "ev": boolean|null,
  "maxPrice": number|null,
  "directReply": string
}`,
    );

    if (!intent.needsSearch || !intent.location) {
      return {
        reply:
          intent.directReply || "I can help with that. Want me to find parking somewhere specific?",
        results: [],
        searchedFor: null,
      };
    }

    const place = await geocodeLocation(intent.location);
    if (!place) {
      return {
        reply: `I couldn't pin down "${intent.location}". Try a more specific place name (e.g. "near the Bengaluru airport" or "next to Cubbon Park").`,
        results: [],
        searchedFor: intent.location,
      };
    }

    const starts = intent.starts ?? new Date(Date.now() + 3600000).toISOString();
    const ends =
      intent.ends ??
      new Date(new Date(starts).getTime() + (intent.durationHours ?? 2) * 3600000).toISOString();

    const client = getPublicClient();
    const { data: rows, error } = await client.rpc("search_spaces", {
      p_lat: place.lat,
      p_lng: place.lng,
      p_radius_km: intent.radiusKm || 5,
      p_starts: starts,
      p_ends: ends,
      p_covered: intent.covered ?? undefined,
      p_gated: intent.gated ?? undefined,
      p_ev: intent.ev ?? undefined,
      p_max_price: intent.maxPrice ?? undefined,
    } as never);
    if (error) throw new Error(error.message);

    const results = ((rows ?? []) as SpaceResult[]).slice(0, 6);
    if (results.length === 0) {
      return {
        reply: `I couldn't find any open spaces near "${place.label}" for that time. Try widening the area or a different time window — or check back soon, new driveways are added all the time.`,
        results: [],
        searchedFor: place.label,
      };
    }

    const listingText = results
      .map(
        (s, i) =>
          `${i + 1}. "${s.title}" — ${s.address}, $${Number(s.price_per_hour).toFixed(2)}/hr` +
          `${s.distance_km !== null ? `, ${Number(s.distance_km).toFixed(1)} km away` : ""}` +
          `${s.is_covered ? ", covered" : ""}${s.is_gated ? ", gated" : ""}${s.has_ev_charging ? ", EV" : ""}`,
      )
      .join("\n");

    const summary = await completeText(
      `You recommend parking options from a marketplace. Today is ${new Date().toISOString()}.
User asked: "${query}"
Matches found near ${place.label}, searched window ${starts} to ${ends}:
${listingText}

Answer in ~100 words: mention the 2-3 best fits (title + hourly price + distance), note features that
matter (EV, covered, gated), and remind that the stay is confirmed after UPI payment. Do not invent
spaces that are not listed.`,
      "Write the recommendation now.",
    );

    return { reply: summary, results, searchedFor: place.label };
  });

export type AiPriceSuggestion = {
  pricePerHour: number;
  pricePerDay: number | null;
  reasoning: string;
};

/**
 * Suggests a listing price using nearby market data plus the space's features.
 */
export const suggestListingPrice = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      title: string;
      description: string;
      address: string;
      lat: number;
      lng: number;
      vehicleTypes: string[];
      isCovered: boolean;
      isGated: boolean;
      hasEv: boolean;
      hasCamera: boolean;
      hasSensor: boolean;
    }) => data,
  )
  .handler(async ({ data }): Promise<AiPriceSuggestion> => {
    if (!isAiConfigured()) {
      throw new Error("AI pricing isn't configured yet — add AI_API_KEY to the server environment");
    }

    const client = getPublicClient();
    const { data: rows, error } = await client.rpc("search_spaces", {
      p_lat: data.lat,
      p_lng: data.lng,
      p_radius_km: 5,
    } as never);
    if (error) throw new Error(error.message);

    const comparable = ((rows ?? []) as SpaceResult[])
      .slice(0, 10)
      .map(
        (s) =>
          `"${s.title.slice(0, 40)}" @ ${s.address.slice(0, 40)} — $${Number(s.price_per_hour).toFixed(2)}/hr` +
          (s.price_per_day ? `, $${Number(s.price_per_day).toFixed(2)}/day` : "") +
          (s.is_covered ? ", covered" : "") +
          (s.is_gated ? ", gated" : "") +
          (s.has_ev_charging ? ", EV" : "") +
          `, ${Number(s.distance_km).toFixed(1)}km away`,
      )
      .join("\n");

    const suggestion = await completeJson<AiPriceSuggestion>(
      `You are a parking-market pricing expert. Given a new listing and nearby comparable listings,
suggest a competitive hourly price (and an optional daily price, or null) in USD, and a short
reasoning (max 2 sentences).

Nearby listings within 5km (average hourly price gives the market baseline):
${comparable || "(no nearby listings yet — use a reasonable baseline of $4-8/hour for a basic spot)"}

Rules:
- Covered, gated, camera, sensor and EV charging add value over the local baseline.
- Trucks and RVs command higher prices; motorcycles lower.
- Keep the price realistic: between $1 and $25 per hour.
- Return JSON: {"pricePerHour": number, "pricePerDay": number|null, "reasoning": string}`,
      `New listing: "${data.title}" (${data.address})
Description: ${data.description.slice(0, 300)}
Vehicle types: ${data.vehicleTypes.join(", ")}
Features: ${
        [
          data.isCovered ? "covered" : "",
          data.isGated ? "gated" : "",
          data.hasEv ? "EV charging" : "",
          data.hasCamera ? "camera" : "",
          data.hasSensor ? "sensor" : "",
        ]
          .filter(Boolean)
          .join(", ") || "none"
      }

Suggest the price now.`,
    );

    const hour = Number(suggestion.pricePerHour);
    if (!Number.isFinite(hour) || hour <= 0) throw new Error("AI returned an invalid price");
    const day =
      suggestion.pricePerDay === null || suggestion.pricePerDay === undefined
        ? null
        : Math.max(Number(suggestion.pricePerDay) || 0, 0) || null;

    return {
      pricePerHour: Math.round(hour * 4) / 4,
      pricePerDay: day ? Math.round(day) : null,
      reasoning: suggestion.reasoning || "Based on nearby listings in this area.",
    };
  });
