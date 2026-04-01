/** Set `PIPELINE_DEBUG=1` in `.env` for verbose poller logs (Gemma, OG, comment_summary rows, etc.). */
export function isPipelineDebug(): boolean {
  return typeof process !== "undefined" && process.env?.PIPELINE_DEBUG === "1";
}
