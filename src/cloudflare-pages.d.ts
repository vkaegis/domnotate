interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: {
      httpMetadata?: {
        contentType?: string;
      };
    },
  ): Promise<unknown>;
}

interface R2ObjectBody {
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
