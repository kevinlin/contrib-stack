# Security Hardening — Connector SSRF, Credential, and DoS Fixes

**Date:** 2026-07-13
**Branch:** `fix/security-high-priority`
**Scan reference:** `codex-security-scan/05_findings/validation_summary.md`

## Context

A comprehensive security scan identified 16 reportable vulnerabilities across the codebase. This plan documents the four highest-priority fixes — all located in `packages/connectors/` — which address server-side request forgery, credential leakage, and denial-of-service via unbounded network operations.

## Findings Addressed

| # | Finding ID | CWE | Severity | Summary |
|---|---|---|---|---|
| 1 | `d-gh-create-ssrf`, `d-gh-resync-ssrf` | CWE-918 | High | Authenticated user controls GitHub `baseUrl`; no scheme, host, IP, or redirect validation before server-side `fetch` |
| 2 | `d-gl-create-ssrf`, `d-gl-resync-ssrf` | CWE-918 | High | Same as above for GitLab connector |
| 3 | `d-gl-redirect-token` | CWE-200, CWE-522 | High | Node's `fetch` forwards custom `PRIVATE-TOKEN` header across cross-origin redirects, leaking PAT to attacker-controlled hosts |
| 4 | `d-gh-response-dos` | CWE-400, CWE-770 | High | `response.json()` materializes unbounded response bodies from attacker-controlled peers |
| 5 | `d-gl-create-pagination-dos`, `d-gl-resync-pagination-dos` | CWE-400, CWE-834 | High | GitLab event pagination loops indefinitely until the peer returns an empty array |

## Design

### Shared safe-fetch module

All protections are implemented in a single module (`packages/connectors/src/safe-fetch.ts`) consumed by both connectors. This centralizes security policy rather than scattering checks across individual fetch sites.

```
┌──────────────────┐     ┌─────────────────────┐
│  github.ts       │────▶│  safe-fetch.ts       │
│  gitlab.ts       │────▶│                      │
└──────────────────┘     │  1. validateUrl()    │
                         │  2. redirect: manual │
                         │  3. header stripping │
                         │  4. size-limited body│
                         └──────────┬───────────┘
                                    │
                                    ▼
                              global fetch()
```

### Control 1: URL validation (`validateUrl`)

Before any network call, the fully-constructed URL is validated:

- **Scheme allowlist:** Only `http:` and `https:` are permitted. Rejects `file:`, `ftp:`, `javascript:`, `data:`, etc.
- **Hostname blocklist:** Rejects `localhost`, `metadata.google.internal`, `169.254.169.254`, IPv6 loopback `[::1]`, and any `.internal` or `.local` suffix.
- **IP range rejection:** Rejects 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 0.0.0.0/8, and 100.64.0.0/10 (CGNAT).
- **IPv6 mapped addresses:** Rejects `::ffff:` mapped private IPv4 addresses.

This runs at both connectors' URL construction time and again at each redirect hop.

### Control 2: Manual redirect following

All connector fetches use `redirect: "manual"`. Redirects are followed explicitly with:

- Re-validation of each redirect destination through `validateUrl`
- Maximum 5 redirect hops
- Origin comparison at each hop to detect cross-origin transitions

### Control 3: Sensitive header stripping

Each connector declares its credential header as sensitive:
- GitHub: `sensitiveHeaders: ["Authorization"]`
- GitLab: `sensitiveHeaders: ["PRIVATE-TOKEN"]`

On any cross-origin redirect, these headers are removed from subsequent requests. This prevents Node's default behavior of forwarding custom headers (like `PRIVATE-TOKEN`) to untrusted origins.

### Control 4: Response size limiting (`SizeLimitedResponse`)

The `safeFetch` return value is wrapped in `SizeLimitedResponse`:

- Early rejection via `Content-Length` header if declared size exceeds 10 MB
- Streaming byte counter during body consumption; aborts with `ResponseTooLargeError` if cumulative bytes exceed the limit
- Applies to `json()`, `text()`, `arrayBuffer()`, and `bytes()` methods

### Control 5: Pagination cap

GitLab's `fetchAllEvents` loop condition changed from `while (true)` to `while (page <= MAX_PAGES_PER_WINDOW)` where `MAX_PAGES_PER_WINDOW = 100`. At 100 events per page, this caps at 10,000 events per year-window — more than sufficient for legitimate users while preventing a malicious peer from holding the backfill indefinitely.

## Files Changed

| File | Change |
|---|---|
| `packages/connectors/src/safe-fetch.ts` | **New.** Shared SSRF-safe fetch with URL validation, redirect safety, header stripping, and response size limiting |
| `packages/connectors/src/safe-fetch.test.ts` | **New.** 17 security-focused tests |
| `packages/connectors/src/github.ts` | Use `safeFetch` + `validateUrl` instead of bare `fetch` |
| `packages/connectors/src/github.test.ts` | Updated mocks to provide proper `Headers` and `ReadableStream` bodies |
| `packages/connectors/src/gitlab.ts` | Use `safeFetch` + `validateUrl`, add `MAX_PAGES_PER_WINDOW` cap |
| `packages/connectors/src/gitlab.test.ts` | Updated mocks, added pagination-cap test |
| `packages/connectors/src/index.ts` | Export `SsrfError`, `ResponseTooLargeError`, `validateUrl` |

## Test Coverage

- 18 new tests covering all security controls
- All 146 tests passing (128 original + 18 new)
- Lint clean (no new errors or warnings)

## Residual Risk

These fixes address the connector-level attack surface. The following medium-priority findings remain unaddressed and are tracked for follow-up:

| Finding | Risk | Mitigation path |
|---|---|---|
| `d-rate-limit-cardinality` | Unauthenticated rate-limiter Map growth | Add LRU/cardinality cap or move check after auth |
| `d-ingest-body-dos` | Large body parsing before auth | Add Content-Length check before `request.json()` |
| `d-backfill-concurrency` | Unbounded background job creation | Per-user connection quota + concurrency semaphore |
| `d-resync-race` | Concurrent resync multiplies work | Acquire `connectionMutex` in resync |
| `d-profile-history-dos` | Full-history SQL load on every request | Push date predicate into SQL, add row cap |
| `d-profile-refresh-fanout` | Anonymous traffic triggers many refreshes | Per-profile refresh cooldown |
| `d-widget-all-dos` | O(N² log N) client-side layout | Pre-compute index, cache intensity distributions |

## Decision Log

| ID | Decision | Rationale |
|---|---|---|
| S1 | Single shared module vs per-connector fixes | Centralizes policy; easier to audit and extend |
| S2 | 10 MB response cap | GitHub contribution responses are ~50 KB per year-window; 10 MB allows 200x headroom |
| S3 | 100 pages per window | 10,000 events per year-window exceeds any legitimate user while bounding work |
| S4 | `redirect: "manual"` over `redirect: "error"` | Legitimate GitLab instances may issue redirects (e.g., domain migration); manual following with validation is safer than blocking all redirects |
| S5 | IP-based blocking without DNS resolution | DNS resolution before connect requires platform-specific APIs or additional deps; hostname/IP pattern matching covers the most common SSRF vectors; acknowledged gap for DNS rebinding attacks |
