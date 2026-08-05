import { describe, expect, test } from "bun:test";
import {
  canAllowDomain,
  emailDomain,
  isReservedDomain,
  PUBLIC_EMAIL_DOMAINS,
  parseAllowedDomains,
} from "@repo/auth/join-policy";

describe("emailDomain", () => {
  test("extracts and lowercases the domain", () => {
    expect(emailDomain("Someone@Forsuxess.DE")).toBe("forsuxess.de");
  });

  test("rejects malformed addresses", () => {
    expect(emailDomain("nodomain@")).toBeNull();
    expect(emailDomain("@nolocal.de")).toBeNull();
    expect(emailDomain("plainstring")).toBeNull();
  });
});

describe("isReservedDomain", () => {
  test("flags RFC 2606 names, which are never emailed", () => {
    expect(isReservedDomain("example.com")).toBe(true);
    expect(isReservedDomain("brain.test")).toBe(true);
    expect(isReservedDomain("anything.invalid")).toBe(true);
  });

  test("passes real domains", () => {
    expect(isReservedDomain("forsuxess.de")).toBe(false);
    // "example" only counts as a TLD or the classic second-level names.
    expect(isReservedDomain("example-corp.de")).toBe(false);
  });
});

describe("canAllowDomain", () => {
  test("an admin can allow exactly their own domain", () => {
    expect(canAllowDomain("eric@forsuxess.de", "forsuxess.de")).toBe(true);
    expect(canAllowDomain("eric@forsuxess.de", "FORSUXESS.DE")).toBe(true);
  });

  test("cannot allow a domain the admin does not use", () => {
    expect(canAllowDomain("eric@forsuxess.de", "competitor.de")).toBe(false);
  });

  test("public mail providers are never allowable", () => {
    expect(canAllowDomain("eric@gmail.com", "gmail.com")).toBe(false);
    expect(PUBLIC_EMAIL_DOMAINS.has("web.de")).toBe(true);
  });
});

describe("parseAllowedDomains", () => {
  test("reads object metadata", () => {
    expect(
      parseAllowedDomains({ allowedDomains: ["Forsuxess.DE", " acme.com "] })
    ).toEqual(["forsuxess.de", "acme.com"]);
  });

  test("reads JSON-string metadata, as the adapter sometimes stores it", () => {
    expect(
      parseAllowedDomains(JSON.stringify({ allowedDomains: ["forsuxess.de"] }))
    ).toEqual(["forsuxess.de"]);
  });

  test("treats malformed metadata as no domains", () => {
    expect(parseAllowedDomains(null)).toEqual([]);
    expect(parseAllowedDomains("not json")).toEqual([]);
    expect(parseAllowedDomains({ allowedDomains: "forsuxess.de" })).toEqual([]);
    expect(parseAllowedDomains({ allowedDomains: [42, ""] })).toEqual([]);
  });
});
