import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  validateUrl,
  safeFetch,
  SsrfError,
  ResponseTooLargeError,
} from "./safe-fetch";

describe("validateUrl", () => {
  it("accepts valid https URLs", () => {
    const url = validateUrl("https://github.example.com/api/graphql");
    expect(url.hostname).toBe("github.example.com");
  });

  it("accepts valid http URLs", () => {
    const url = validateUrl("http://gitlab.example.com/api/v4/user");
    expect(url.hostname).toBe("gitlab.example.com");
  });

  it("rejects non-http schemes", () => {
    expect(() => validateUrl("file:///etc/passwd")).toThrow(SsrfError);
    expect(() => validateUrl("ftp://internal.host/data")).toThrow(SsrfError);
    expect(() => validateUrl("javascript:alert(1)")).toThrow(SsrfError);
  });

  it("rejects localhost", () => {
    expect(() => validateUrl("http://localhost/admin")).toThrow(SsrfError);
    expect(() => validateUrl("http://localhost:3000/api")).toThrow(SsrfError);
  });

  it("rejects loopback IPs", () => {
    expect(() => validateUrl("http://127.0.0.1/admin")).toThrow(SsrfError);
    expect(() => validateUrl("http://127.0.0.1:8080/api")).toThrow(SsrfError);
    expect(() => validateUrl("http://127.1.2.3/path")).toThrow(SsrfError);
  });

  it("rejects private network IPs (RFC1918)", () => {
    expect(() => validateUrl("http://10.0.0.1/api")).toThrow(SsrfError);
    expect(() => validateUrl("http://172.16.0.1/api")).toThrow(SsrfError);
    expect(() => validateUrl("http://172.31.255.255/api")).toThrow(SsrfError);
    expect(() => validateUrl("http://192.168.1.1/api")).toThrow(SsrfError);
  });

  it("rejects link-local / metadata IPs", () => {
    expect(() => validateUrl("http://169.254.169.254/latest")).toThrow(
      SsrfError,
    );
    expect(() => validateUrl("http://169.254.1.1/meta")).toThrow(SsrfError);
  });

  it("rejects cloud metadata hostnames", () => {
    expect(() =>
      validateUrl("http://metadata.google.internal/computeMetadata/v1"),
    ).toThrow(SsrfError);
  });

  it("rejects .internal and .local hostnames", () => {
    expect(() => validateUrl("http://service.internal/api")).toThrow(SsrfError);
    expect(() => validateUrl("http://printer.local/status")).toThrow(SsrfError);
  });

  it("rejects IPv6 loopback", () => {
    expect(() => validateUrl("http://[::1]/admin")).toThrow(SsrfError);
  });

  it("allows legitimate public IPs", () => {
    expect(() => validateUrl("https://140.82.121.4/api")).not.toThrow();
    expect(() => validateUrl("https://8.8.8.8/dns")).not.toThrow();
  });

  it("rejects invalid URLs", () => {
    expect(() => validateUrl("not-a-url")).toThrow(SsrfError);
    expect(() => validateUrl("")).toThrow(SsrfError);
  });
});

describe("safeFetch", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockResponse(
    body: string,
    status = 200,
    headers: Record<string, string> = {},
  ): Response {
    const encoded = new TextEncoder().encode(body);
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? "OK" : "Error",
      headers: new Headers({
        "content-length": String(encoded.byteLength),
        ...headers,
      }),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoded);
          controller.close();
        },
      }),
      redirected: false,
      type: "basic",
      url: "",
      bodyUsed: false,
      clone: () => mockResponse(body, status, headers),
      arrayBuffer: async () => encoded.buffer as ArrayBuffer,
      blob: async () => new Blob([encoded]),
      formData: async () => new FormData(),
      json: async () => JSON.parse(body),
      text: async () => body,
      bytes: async () => encoded,
    } as Response;
  }

  it("validates URL before making request", async () => {
    await expect(
      safeFetch("http://127.0.0.1:3000/admin"),
    ).rejects.toThrow(SsrfError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("strips sensitive headers on cross-origin redirect", async () => {
    const redirectResponse = {
      ok: false,
      status: 302,
      headers: new Headers({
        location: "https://evil.example.com/steal",
      }),
      body: null,
      redirected: false,
    } as unknown as Response;

    const finalResponse = mockResponse('{"ok":true}');

    vi.mocked(fetch)
      .mockResolvedValueOnce(redirectResponse)
      .mockResolvedValueOnce(finalResponse);

    const result = await safeFetch("https://gitlab.example.com/api/v4/user", {
      headers: { "PRIVATE-TOKEN": "secret-pat" },
      sensitiveHeaders: ["PRIVATE-TOKEN"],
    });

    expect(result.ok).toBe(true);

    const secondCall = vi.mocked(fetch).mock.calls[1];
    const secondHeaders = secondCall[1]?.headers as Record<string, string>;
    expect(secondHeaders["PRIVATE-TOKEN"]).toBeUndefined();
  });

  it("rejects redirects to private IPs", async () => {
    const redirectResponse = {
      ok: false,
      status: 302,
      headers: new Headers({
        location: "http://169.254.169.254/latest/meta-data/",
      }),
      body: null,
      redirected: false,
    } as unknown as Response;

    vi.mocked(fetch).mockResolvedValueOnce(redirectResponse);

    await expect(
      safeFetch("https://gitlab.example.com/api/v4/user", {
        headers: { "PRIVATE-TOKEN": "pat" },
        sensitiveHeaders: ["PRIVATE-TOKEN"],
      }),
    ).rejects.toThrow(SsrfError);
  });

  it("rejects responses exceeding size limit", async () => {
    const bigChunk = new Uint8Array(1024);
    let chunksSent = 0;
    const bigResponse = {
      ok: true,
      status: 200,
      headers: new Headers({}),
      body: new ReadableStream({
        pull(controller) {
          if (chunksSent < 200) {
            controller.enqueue(bigChunk);
            chunksSent++;
          } else {
            controller.close();
          }
        },
      }),
      redirected: false,
    } as unknown as Response;

    vi.mocked(fetch).mockResolvedValueOnce(bigResponse);

    const resp = await safeFetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { Authorization: "Bearer token" },
      body: "{}",
      maxResponseBytes: 100 * 1024, // 100 KB limit
    });

    await expect(resp.json()).rejects.toThrow(ResponseTooLargeError);
  });

  it("limits redirect count", async () => {
    const makeRedirect = (n: number) =>
      ({
        ok: false,
        status: 302,
        headers: new Headers({
          location: `https://hop${n}.example.com/path`,
        }),
        body: null,
        redirected: false,
      }) as unknown as Response;

    vi.mocked(fetch).mockImplementation(async () => makeRedirect(1));

    await expect(
      safeFetch("https://start.example.com/api"),
    ).rejects.toThrow(SsrfError);

    expect(vi.mocked(fetch).mock.calls.length).toBeLessThanOrEqual(6);
  });
});
