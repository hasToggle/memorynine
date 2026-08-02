import { describe, expect, test } from "bun:test";
// The barrel is the package's canonical entry (package.json "main"). It must
// be importable from any server runtime — Next.js, the eve agent app, and Bun
// tests — so it must not transitively import `server-only`, which throws
// outside a react-server bundling context. If this static import ever starts
// throwing again, this whole file fails: that is the regression signal.
import {
  buildFactsSearchPipeline,
  erasePerson,
  getCollections,
  ObjectId,
} from "../index";

describe("package barrel", () => {
  test("exposes the data-layer API", () => {
    expect(typeof buildFactsSearchPipeline).toBe("function");
    expect(typeof erasePerson).toBe("function");
    expect(typeof getCollections).toBe("function");
  });

  test("re-exports ObjectId so consumers do not import the driver directly", () => {
    expect(new ObjectId().toHexString()).toHaveLength(24);
  });
});
