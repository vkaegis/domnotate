// Target and redirect validation for the outbound URL proxy.
//
// Only public http(s) targets on the standard ports are allowed. Loopback,
// private, link-local, multicast, unspecified, and documentation-only
// destinations are rejected for both IPv4 and IPv6 so the proxy cannot be
// pointed at internal infrastructure. The WHATWG URL parser normalizes
// numeric and encoded host variants (for example `127.1`, `2130706433`,
// `0x7f000001`, and `%6cocalhost`) before these checks run, so the canonical
// host is what gets validated.
//
// Limitation: this validates the URL string, not the address the host
// ultimately resolves to. A DNS-rebinding target whose name resolves to a
// private address cannot be caught here because the Workers runtime does not
// expose the resolved address before the subrequest. Cloudflare request
// controls remain the additional boundary for that case.

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const ALLOWED_PORTS = new Set(['', '80', '443']);
const IPV4_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/**
 * Parse a caller-supplied target. Defaults to HTTPS when the scheme is
 * omitted. Returns a validated URL, or null when the target is malformed or
 * points at a non-public destination.
 */
export function normalizeTarget(raw: string): URL | null {
  const parsed = parseWithDefaultScheme(raw);
  if (!parsed) return null;
  return isPublicHttpUrl(parsed) ? parsed : null;
}

/**
 * Resolve a redirect `Location` against the URL it came from and validate it
 * with the same policy. Returns null when the destination is not a public
 * http(s) target.
 */
export function resolveRedirect(location: string, base: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(location, base);
  } catch {
    return null;
  }
  return isPublicHttpUrl(parsed) ? parsed : null;
}

export function isPublicHttpUrl(url: URL): boolean {
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return false;
  if (url.username !== '' || url.password !== '') return false;
  if (!ALLOWED_PORTS.has(url.port)) return false;
  return !isBlockedHost(url.hostname);
}

function parseWithDefaultScheme(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    try {
      return new URL(`https://${raw}`);
    } catch {
      return null;
    }
  }
}

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();

  // IPv6 literals arrive bracketed from the URL parser.
  if (host.startsWith('[') && host.endsWith(']')) {
    return isBlockedIPv6(host.slice(1, -1));
  }

  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.local')) return true;

  if (IPV4_RE.test(host)) return isBlockedIPv4(host);

  return false;
}

function isBlockedIPv4(host: string): boolean {
  const octets = host.split('.').map((part) => Number(part));
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    // Not a well-formed dotted quad; treat as suspicious.
    return true;
  }
  const [a, b, c] = octets;

  if (a === 0) return true; // "this network" / unspecified
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 192 && b === 0 && c === 0) return true; // IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1 (documentation)
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2 (documentation)
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3 (documentation)
  if (a >= 224) return true; // multicast (224/4) and reserved (240/4)

  return false;
}

function isBlockedIPv6(address: string): boolean {
  const addr = address.toLowerCase();

  // IPv4-mapped and IPv4-compatible addresses embed an IPv4 target.
  const mapped = addr.match(/^::(?:ffff:)?(.+)$/);
  if (mapped) {
    const tail = mapped[1];
    if (tail.includes('.')) return isBlockedIPv4(tail);
    const groups = tail.split(':');
    if (groups.length === 2) {
      const hi = parseInt(groups[0], 16);
      const lo = parseInt(groups[1], 16);
      if (Number.isFinite(hi) && Number.isFinite(lo)) {
        const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
        return isBlockedIPv4(ipv4);
      }
    }
  }

  if (addr === '::' || addr === '::1') return true; // unspecified and loopback
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // unique local (fc00::/7)
  if (/^fe[89ab]/.test(addr)) return true; // link-local (fe80::/10)
  if (addr.startsWith('ff')) return true; // multicast (ff00::/8)
  if (addr.startsWith('2001:db8')) return true; // documentation (2001:db8::/32)

  return false;
}
