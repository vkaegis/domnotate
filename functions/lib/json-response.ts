/** A JSON body with the no-store policy every share endpoint uses. */
export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...init.headers,
    },
  });
}

/** A machine-readable failure. The code is the contract the client maps on. */
export function errorResponse(status: number, code: string): Response {
  return jsonResponse({ code }, { status });
}
