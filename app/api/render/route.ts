// POST /api/render — the only server route. Stateless: all prompt-layer history
// arrives in the request body and is concatenated into a single user message.
// See doc 02 §5 for the architecture rationale, doc 05 for the prompt template.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getGeminiClient, getModelId } from "@/lib/gemini/client";
import { buildPrompt } from "@/lib/gemini/prompt-template";
import {
  renderRequestSchema,
  type RenderErrorResponse,
  type RenderResponse,
} from "@/lib/types";

export const runtime = "nodejs"; // Gemini SDK needs Node APIs.
export const maxDuration = 60; // Doc 02 §7: bump from default for complex renders.

export async function POST(req: NextRequest): Promise<NextResponse> {
  const t0 = Date.now();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  const parsed = renderRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      400,
      "Invalid render request",
      formatZodError(parsed.error),
    );
  }
  const input = parsed.data;

  const { systemPrompt, userParts, missingReferenceIndices } = buildPrompt(input);

  let client;
  try {
    client = getGeminiClient();
  } catch (e) {
    return errorResponse(
      500,
      "Server is not configured",
      e instanceof Error ? e.message : String(e),
    );
  }

  const modelId = getModelId();

  try {
    const response = await client.models.generateContent({
      model: modelId,
      contents: [{ role: "user", parts: userParts }],
      config: {
        systemInstruction: systemPrompt,
        // Image-generating Gemini models require explicit image modality.
        responseModalities: ["IMAGE"],
        // Doc 03 §5: 4K native, ~$0.24 per image. Single-user cost is trivial;
        // always ask for 4K so Save Render writes the highest-fidelity asset.
        imageConfig: { imageSize: "4K" },
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find(
      (p): p is { inlineData: { mimeType?: string; data?: string } } =>
        typeof p === "object" && p !== null && "inlineData" in p,
    );

    if (!imagePart?.inlineData?.data) {
      // Gemini blocked the response (safety filter, etc.) or returned text only.
      const promptFeedback = response.promptFeedback;
      const blockReason =
        promptFeedback?.blockReason ?? "no image returned by the model";
      return errorResponse(502, "No image in model response", String(blockReason));
    }

    const payload: RenderResponse = {
      imageBase64: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType ?? "image/png",
      durationMs: Date.now() - t0,
      // Thinking-mode toggle is not exposed in v1; this stays false.
      thinkingUsed: false,
    };

    const headers: Record<string, string> = {};
    if (missingReferenceIndices.length > 0) {
      // Surface dropped tokens so the client can toast about it.
      headers["x-audrey-missing-refs"] = missingReferenceIndices.join(",");
    }

    return NextResponse.json(payload, { headers });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Unknown error from Gemini SDK";
    return errorResponse(502, "Model call failed", message);
  }
}

function errorResponse(
  status: number,
  error: string,
  detail?: string,
): NextResponse {
  const body: RenderErrorResponse = detail ? { error, detail } : { error };
  return NextResponse.json(body, { status });
}

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}
