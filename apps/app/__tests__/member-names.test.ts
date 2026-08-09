import { describe, expect, test } from "bun:test";
import { buildNameResolver } from "../lib/member-names";

const MEMBERS = [
  {
    email: "eric@example.com",
    imageUrl: "",
    name: "Eric Brandt",
    userId: "user_eric",
  },
  {
    email: "marie@example.com",
    imageUrl: "",
    name: "Marie Lang",
    userId: "user_marie",
  },
];

describe("buildNameResolver", () => {
  const nameOf = buildNameResolver(MEMBERS);

  test("resolves a better-auth user id, as stored on fact.confirmedBy", () => {
    expect(nameOf("user_marie")).toBe("Marie Lang");
  });

  test("resolves an email address, as stored on source.capturedBy", () => {
    expect(nameOf("eric@example.com")).toBe("Eric Brandt");
  });

  test("matches an email case-insensitively", () => {
    expect(nameOf("Eric@Example.com")).toBe("Eric Brandt");
  });

  test("degrades to a teammate rather than leaking a raw id", () => {
    expect(nameOf("user_ceo1")).toBe("a teammate");
    expect(nameOf("eval-fixture")).toBe("a teammate");
  });

  test("keeps an unknown email, which is at least true", () => {
    expect(nameOf("extern@kunde.de")).toBe("extern@kunde.de");
  });

  test("an empty directory still never returns a raw id", () => {
    expect(buildNameResolver([])("user_ceo1")).toBe("a teammate");
  });
});
