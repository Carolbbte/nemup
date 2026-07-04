// Wraps an OpenAI call (including reading its response/stream) and retries the whole
// request from scratch on failure. This is needed because errors like "Invalid response
// body ... Premature close" happen while the body is being read — after the OpenAI SDK's
// own connection has already succeeded — so the SDK's built-in maxRetries never sees them.
export async function withOpenAIRetry<T>(fn: () => Promise<T>, label: string, retries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const message = err instanceof Error ? err.message : String(err);
      const attemptsLeft = retries + 1 - attempt;
      console.warn(`[${label}] Intento ${attempt}/${retries + 1} falló: ${message}${attemptsLeft > 0 ? ` — reintentando (${attemptsLeft} restantes)` : ''}`);
      if (attemptsLeft > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  throw lastErr;
}
