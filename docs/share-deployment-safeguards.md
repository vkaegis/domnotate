# Share MVP Deployment Safeguards

The repository can enforce payload shape and size, but three safeguards live in the
Cloudflare account because they are bucket, zone, or billing settings. Configure
these before enabling public sharing.

## R2 Lifecycle

Bucket: `domnotate-shares`

Rule:
- Name: `delete-shares-after-30-days`
- Prefix: `share/`
- Action: expire/delete objects
- Age: `30` days

Wrangler command:

```bash
npx wrangler r2 bucket lifecycle add domnotate-shares \
  --id delete-shares-after-30-days \
  --prefix share/ \
  --expire-days 30
```

Cloudflare also supports setting lifecycle configuration from JSON via
`wrangler r2 bucket lifecycle set <BUCKET_NAME> --file <FILE_PATH>`.
R2 lifecycle rules are bucket-level settings, not Pages project settings, so
they are intentionally documented here instead of represented in `wrangler.jsonc`.

Source: https://developers.cloudflare.com/r2/buckets/object-lifecycles/

## Rate Limit

Target only the share API:

```text
http.request.uri.path starts_with "/api/share"
```

Preferred rule:
- Requests: `30`
- Period: `60` seconds
- Characteristic: source IP
- Action: block
- Mitigation timeout: `60` seconds

If the account's Cloudflare plan only allows a 10-second counting period, use
`5 requests / 10 seconds / IP` as the free-plan approximation of 30 requests per
minute. The current Cloudflare WAF docs list rate-limiting availability by plan;
Free plan counting is IP-based and more limited than paid plans.

Source: https://developers.cloudflare.com/waf/rate-limiting-rules/

## Billing Alert

Create a budget alert:
- Name: `Domnotate R2 spend warning`
- Threshold: `$1`
- Recipients: project owner email(s)

Budget alerts are informational; they send email and do not pause usage. They
are available for Pay-as-you-go accounts. If the account does not expose budget
alerts, use the billable usage dashboard as the manual fallback during rollout.

Source: https://developers.cloudflare.com/billing/manage/budget-alerts/

## Free-Tier Notes

No paid Workers plan is required for this MVP. Cloudflare documents a Workers
Free request allowance and Pages fail-open/fail-closed behavior when the free
allowance is exhausted; set the Pages project to fail closed so share API routes
return an error instead of bypassing Functions.

R2 is usage-based with a free tier for Standard storage and operations. Current
Cloudflare docs list R2 free-tier allowances as `10 GB` storage, `1M` Class A
operations, and `10M` Class B operations, with no R2 egress charge. The 5 MB app
cap, 30-day lifecycle, and rate limit are the app-level controls that keep usage
bounded.

Sources:
- https://developers.cloudflare.com/pages/functions/routing/#fail-open--closed
- https://developers.cloudflare.com/billing/understand/usage-based-billing/
- https://developers.cloudflare.com/r2/pricing/
