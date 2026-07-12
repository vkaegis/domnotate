export type RequestBodyErrorCode =
  | 'unsupported_media_type'
  | 'malformed_json'
  | 'payload_too_large';

export type ReadJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; code: RequestBodyErrorCode; status: number };

export function hasJsonContentType(request: Request): boolean {
  const contentType = request.headers.get('content-type');
  return contentType?.split(';', 1)[0].trim().toLowerCase() === 'application/json';
}

function declaredBodyIsOversized(request: Request, limit: number): boolean {
  const value = request.headers.get('content-length');
  if (value === null) return false;
  const length = Number(value);
  return Number.isFinite(length) && length > limit;
}

export async function readLimitedJsonBody(
  request: Request,
  limit: number,
): Promise<ReadJsonResult> {
  if (!hasJsonContentType(request)) {
    return { ok: false, code: 'unsupported_media_type', status: 415 };
  }

  if (declaredBodyIsOversized(request, limit)) {
    await request.body?.cancel();
    return { ok: false, code: 'payload_too_large', status: 413 };
  }

  const reader = request.body?.getReader();
  if (!reader) return { ok: false, code: 'malformed_json', status: 400 };

  const chunks: Uint8Array[] = [];
  let received = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      received += value.byteLength;
      if (received > limit) {
        await reader.cancel();
        return { ok: false, code: 'payload_too_large', status: 413 };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, code: 'malformed_json', status: 400 };
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, code: 'malformed_json', status: 400 };
  }

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, code: 'malformed_json', status: 400 };
  }
}
