/**
 * SSRF-safe fetch wrapper: validates destination URLs, rejects private/internal
 * targets, enforces redirect safety, and caps response size.
 */

const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MB

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

export class ResponseTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResponseTooLargeError";
  }
}

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
  "169.254.169.254",
  "[::1]",
  "[fe80::1]",
  "[fd00::1]",
]);

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(lower)) return true;

  // IPv6 loopback / link-local / private in bracket notation
  if (lower.startsWith("[")) {
    const inner = lower.slice(1, -1);
    if (
      inner === "::1" ||
      inner === "::ffff:127.0.0.1" ||
      inner.startsWith("fe80:") ||
      inner.startsWith("fc00:") ||
      inner.startsWith("fd") ||
      inner.startsWith("::ffff:169.254.") ||
      inner.startsWith("::ffff:10.") ||
      inner.startsWith("::ffff:192.168.") ||
      inner.startsWith("::ffff:172.")
    ) {
      return true;
    }
  }

  // Bare IPv4 check
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(lower)) {
    return PRIVATE_IP_PATTERNS.some((p) => p.test(lower));
  }

  // Block common cloud metadata hostnames
  if (
    lower.endsWith(".internal") ||
    lower.endsWith(".local") ||
    lower === "metadata"
  ) {
    return true;
  }

  return false;
}

export function validateUrl(urlString: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new SsrfError(`Invalid URL: ${urlString}`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new SsrfError(
      `Blocked scheme "${parsed.protocol}" — only http and https are allowed`,
    );
  }

  if (!parsed.hostname) {
    throw new SsrfError("URL has no hostname");
  }

  if (isBlockedHostname(parsed.hostname)) {
    throw new SsrfError(
      `Blocked destination: ${parsed.hostname} resolves to a private or internal address`,
    );
  }

  return parsed;
}

export type SafeFetchOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Headers to strip on cross-origin redirects */
  sensitiveHeaders?: string[];
  maxResponseBytes?: number;
  signal?: AbortSignal;
};

/**
 * Fetch with SSRF protections:
 * - Validates URL scheme and hostname
 * - Follows redirects manually, re-validating each hop
 * - Strips sensitive headers on cross-origin redirects
 * - Caps response body size
 */
export async function safeFetch(
  url: string,
  options: SafeFetchOptions = {},
): Promise<Response> {
  const {
    method = "GET",
    headers = {},
    body,
    sensitiveHeaders = [],
    maxResponseBytes = MAX_RESPONSE_BYTES,
    signal,
  } = options;

  let currentUrl = url;
  let currentHeaders = { ...headers };
  let redirectCount = 0;

  while (true) {
    const validated = validateUrl(currentUrl);

    const response = await fetch(validated.href, {
      method: redirectCount === 0 ? method : "GET",
      headers: currentHeaders,
      body: redirectCount === 0 ? body : undefined,
      redirect: "manual",
      signal,
    });

    if (
      response.status >= 300 &&
      response.status < 400 &&
      response.headers.get("location")
    ) {
      redirectCount++;
      if (redirectCount > MAX_REDIRECTS) {
        throw new SsrfError("Too many redirects");
      }

      const location = response.headers.get("location")!;
      const nextUrl = new URL(location, currentUrl);

      validateUrl(nextUrl.href);

      const currentOrigin = new URL(currentUrl).origin;
      const nextOrigin = nextUrl.origin;

      if (currentOrigin !== nextOrigin) {
        for (const header of sensitiveHeaders) {
          const lower = header.toLowerCase();
          const newHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(currentHeaders)) {
            if (k.toLowerCase() !== lower) {
              newHeaders[k] = v;
            }
          }
          currentHeaders = newHeaders;
        }
      }

      currentUrl = nextUrl.href;
      continue;
    }

    // Check Content-Length early if available
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > maxResponseBytes) {
      throw new ResponseTooLargeError(
        `Response size ${contentLength} exceeds limit of ${maxResponseBytes} bytes`,
      );
    }

    return new SizeLimitedResponse(response, maxResponseBytes);
  }
}

/**
 * A Response wrapper that enforces a byte limit when reading the body.
 */
class SizeLimitedResponse implements Response {
  private _inner: Response;
  private _maxBytes: number;
  private _consumed = false;

  constructor(inner: Response, maxBytes: number) {
    this._inner = inner;
    this._maxBytes = maxBytes;
  }

  get headers() {
    return this._inner.headers;
  }
  get ok() {
    return this._inner.ok;
  }
  get redirected() {
    return this._inner.redirected;
  }
  get status() {
    return this._inner.status;
  }
  get statusText() {
    return this._inner.statusText;
  }
  get type() {
    return this._inner.type;
  }
  get url() {
    return this._inner.url;
  }
  get body() {
    return this._inner.body;
  }
  get bodyUsed() {
    return this._inner.bodyUsed;
  }

  clone(): Response {
    return new SizeLimitedResponse(this._inner.clone(), this._maxBytes);
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    const buf = await this._readLimited();
    return buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    ) as ArrayBuffer;
  }

  async blob(): Promise<Blob> {
    const buf = await this._readLimited();
    return new Blob([buf]);
  }

  async formData(): Promise<FormData> {
    return this._inner.formData();
  }

  async json(): Promise<unknown> {
    const text = await this.text();
    return JSON.parse(text);
  }

  async text(): Promise<string> {
    const buf = await this._readLimited();
    return new TextDecoder().decode(buf);
  }

  async bytes(): Promise<Uint8Array> {
    return this._readLimited();
  }

  private async _readLimited(): Promise<Uint8Array> {
    if (this._consumed) {
      throw new TypeError("Body already consumed");
    }
    this._consumed = true;

    const reader = this._inner.body?.getReader();
    if (!reader) {
      return new Uint8Array(0);
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > this._maxBytes) {
        await reader.cancel();
        throw new ResponseTooLargeError(
          `Response body exceeded ${this._maxBytes} bytes`,
        );
      }
      chunks.push(value);
    }

    const result = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  }
}
