// Pure joining policy, shared by client and server. The server-side join
// path re-validates everything here — client callers use it only for UX.

/**
 * Public mail providers can never be an organization's domain: allowing one
 * would open the org to everyone with a free mailbox, and "everyone at
 * gmail.com" is not a company.
 */
export const PUBLIC_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "aol.com",
  "freenet.de",
  "gmail.com",
  "gmx.at",
  "gmx.ch",
  "gmx.de",
  "gmx.net",
  "googlemail.com",
  "hotmail.com",
  "hotmail.de",
  "icloud.com",
  "live.com",
  "live.de",
  "mail.com",
  "me.com",
  "outlook.com",
  "outlook.de",
  "posteo.de",
  "proton.me",
  "protonmail.com",
  "t-online.de",
  "web.de",
  "yahoo.com",
  "yahoo.de",
]);

// RFC 2606/6761 reserved names: mail to these can never be delivered, so
// senders skip them — which also keeps tests and local development from
// bouncing real mail.
const RESERVED_TLDS = new Set(["example", "invalid", "localhost", "test"]);
const RESERVED_DOMAINS = new Set(["example.com", "example.net", "example.org"]);

export const emailDomain = (email: string): string | null => {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) {
    return null;
  }
  return email.slice(at + 1).toLowerCase();
};

export const isReservedDomain = (domain: string): boolean => {
  const normalized = domain.toLowerCase();
  if (RESERVED_DOMAINS.has(normalized)) {
    return true;
  }
  const tld = normalized.slice(normalized.lastIndexOf(".") + 1);
  return RESERVED_TLDS.has(tld);
};

/**
 * An admin may only allow the domain of their own email: you cannot open
 * your org to a domain you don't demonstrably use yourself. (The join path
 * additionally requires that admin's email to be verified.)
 */
export const canAllowDomain = (adminEmail: string, domain: string): boolean => {
  const normalized = domain.trim().toLowerCase();
  return (
    normalized.length > 0 &&
    !PUBLIC_EMAIL_DOMAINS.has(normalized) &&
    emailDomain(adminEmail) === normalized
  );
};

/**
 * better-auth's Mongo adapter stores organization metadata either as an
 * object or as a JSON string depending on the write path — accept both, and
 * treat anything malformed as "no domains allowed".
 */
export const parseAllowedDomains = (metadata: unknown): string[] => {
  let value = metadata;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (value === null || typeof value !== "object") {
    return [];
  }
  const domains = (value as { allowedDomains?: unknown }).allowedDomains;
  if (!Array.isArray(domains)) {
    return [];
  }
  return domains
    .filter((domain): domain is string => typeof domain === "string")
    .map((domain) => domain.trim().toLowerCase())
    .filter((domain) => domain.length > 0);
};
