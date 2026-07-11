# Security Policy

## Reporting a vulnerability

Please do **not** file public GitHub issues for security vulnerabilities.

Email: help@domnotate.com

Include:
- What the issue is
- How to reproduce it
- What an attacker could do with it

I'll acknowledge within 7 days and discuss a fix + disclosure timeline.

## Scope

Domnotate has a browser application and Cloudflare Pages Functions under `functions/`:

- Local sessions and annotations are stored in browser IndexedDB.
- Creating a shared link uploads the captured HTML, annotations, and text edits to the configured object-storage backend.
- Anyone with a share link can view and edit its contents. Share identifiers are the authorization boundary; there are no user accounts or per-user permissions.
- New anonymous shares require server-validated abuse verification. This adds friction to automated creation but is not a hard spending cap; operators should also configure rate limits, lifecycle rules, and usage alerts.
- The outbound URL endpoint fetches public web pages on behalf of users so the browser can load cross-origin HTML.

Captured pages may contain sensitive source-document content. Treat a share link as a bearer credential, do not publish content that should not be uploaded, and remove shared objects from the configured storage backend if a link is disclosed unintentionally.

Relevant vulnerability classes include:

- Script injection or unsafe rendering of captured HTML.
- Unauthorized discovery, reading, or modification of public-by-link shares.
- Server-side request forgery or unsafe redirects through the outbound URL proxy.
- Resource exhaustion that creates unexpected object-storage, request, egress, or compute costs.
- Bypasses of request-size, content-type, abuse-verification, or endpoint-disable controls.
- Exposure of deployment credentials or Cloudflare account configuration.

Cloudflare dashboard controls such as rate limiting, storage lifecycle rules, and secret management are part of the production defense, but reports should assume that code-level checks must remain safe when a dashboard rule is absent or misconfigured.

## Repository credential policy

The repository must not contain API keys, account or zone IDs, deployment tokens, real values in example environment files, or personal deployment configuration. Public API routes and binding names are not secrets. Production secrets belong in Cloudflare secrets or encrypted environment variables, and deployment should use a narrowly scoped API token rather than the Global API Key.
