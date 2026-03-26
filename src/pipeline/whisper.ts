import { PIPELINE_CONFIG } from "../config/channels.js";

const MAX_503_RETRIES = 3;
const RETRY_DELAY_MS = 20_000;

export async function transcribeAudio(audioBuffer: Buffer, attempt = 0): Promise<string> {
  const res = await fetch(
    `https://api-inference.huggingface.co/models/${PIPELINE_CONFIG.HF_WHISPER}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.HF_API_KEY}` },
      body: new Uint8Array(audioBuffer),
    }
  );
  if (res.status === 503 && attempt < MAX_503_RETRIES) {
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    return transcribeAudio(audioBuffer, attempt + 1);
  }
  if (!res.ok) {
    console.warn(`[Whisper] HTTP ${res.status}`);
    return "";
  }
  const data = (await res.json()) as { text?: string };
  return data.text ?? "";
}
