import { PDFParse } from "pdf-parse";

export type PdfExtractResult =
  | { ok: true; text: string }
  | { ok: false; reason: "empty" | "error" };

/**
 * Extract plain text from a PDF buffer.
 */
export async function extractTextFromPdf(buffer: Buffer, maxChars: number): Promise<PdfExtractResult> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const raw = (result.text ?? "").trim();
    if (!raw) return { ok: false, reason: "empty" };
    const text = raw.length > maxChars ? `${raw.slice(0, maxChars)}\n\n[truncated]` : raw;
    return { ok: true, text };
  } catch {
    return { ok: false, reason: "error" };
  } finally {
    await parser.destroy().catch(() => {});
  }
}
