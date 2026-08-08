import { expect, test } from "bun:test";
import Page, {
  metadata,
} from "../app/(unauthenticated)/sign-in/[[...sign-in]]/page";

test("Sign In Page exports default component", () => {
  expect(Page).toBeDefined();
  expect(typeof Page).toBe("function");
});

test("Sign In Page has metadata", () => {
  expect(metadata).toBeDefined();
  expect(metadata.title).toBe("Welcome back | memorynine");
  expect(metadata.description).toBe("Enter your details to sign in.");
});
