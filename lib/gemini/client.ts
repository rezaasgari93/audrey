// Server-side Gemini client. Never import this from a Client Component.
import { GoogleGenAI } from "@google/genai";

let _client: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Copy .env.example to .env.local and fill it in.",
    );
  }
  if (!_client) {
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

export function getModelId(): string {
  return process.env.GEMINI_MODEL_ID ?? "gemini-3-pro-image-preview";
}
