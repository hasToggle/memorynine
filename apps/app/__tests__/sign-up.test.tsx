import { expect, test } from "bun:test";
import Page, {
  metadata,
} from "../app/(unauthenticated)/sign-up/[[...sign-up]]/page";

test("Sign Up Page exports default component", () => {
  expect(Page).toBeDefined();
  expect(typeof Page).toBe("function");
});

test("Sign Up Page has metadata", () => {
  expect(metadata).toBeDefined();
  expect(metadata.title).toBe("Create an account | memorynine");
  expect(metadata.description).toBe("Enter your details to get started.");
});
