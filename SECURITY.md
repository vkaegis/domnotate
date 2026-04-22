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

Domnotate runs entirely in the browser and stores data in IndexedDB locally. There is no backend auth, no multi-tenant data, and no server-side secrets. The most likely vulnerability classes are XSS in rendered HTML content and issues in the IndexedDB persistence layer.
