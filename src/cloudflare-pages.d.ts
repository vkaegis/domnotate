interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: {
      httpMetadata?: {
        contentType?: string;
      };
      /**
       * Precondition for the write. R2 resolves the put to `null` instead of
       * writing when the condition does not hold.
       */
      onlyIf?: {
        etagMatches?: string;
      };
    },
  ): Promise<R2Object | null>;
  delete(key: string): Promise<void>;
}

interface R2Object {
  /** Strong entity tag, unquoted. */
  etag: string;
  /** Entity tag in HTTP header form, i.e. quoted. */
  httpEtag: string;
}

interface R2ObjectBody extends R2Object {
  text(): Promise<string>;
}

type PagesFunction<
  Env = unknown,
  Params extends Record<string, string | string[]> = Record<string, string | string[]>,
  Data = unknown,
> = (context: {
  request: Request;
  env: Env;
  params: Params;
  data: Data;
  waitUntil: (promise: Promise<unknown>) => void;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  functionPath: string;
}) => Response | Promise<Response>;
