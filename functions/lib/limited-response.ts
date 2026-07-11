// Bounded reads for upstream proxy responses.
//
// The proxy must never buffer an unbounded body. Reads stop as soon as the
// accumulated size reaches the limit, and the underlying stream is cancelled
// so the upstream connection can be torn down.

export const MAX_PROXY_BYTES = 5 * 1024 * 1024;

/**
 * Read an upstream body up to `limit` bytes. Returns the collected bytes, or
 * null when the body reaches the limit (the stream is cancelled in that case).
 */
export async function readLimitedBody(
  response: Response,
  limit: number = MAX_PROXY_BYTES,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const body = response.body;
  if (!body) return new Uint8Array(0);

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    received += value.byteLength;
    if (received >= limit) {
      await reader.cancel();
      return null;
    }

    chunks.push(value);
  }

  const result = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
