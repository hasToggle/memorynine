import { describe, expect, test } from "bun:test";
import {
  normalizeAudioContentType,
  pickRecordingMimeType,
} from "../lib/capture";

describe("normalizeAudioContentType", () => {
  test("strips codec parameters", () => {
    expect(normalizeAudioContentType("audio/webm;codecs=opus")).toBe(
      "audio/webm"
    );
  });

  test("passes plain audio types through", () => {
    expect(normalizeAudioContentType("audio/mp4")).toBe("audio/mp4");
  });

  test("rejects non-audio types", () => {
    expect(normalizeAudioContentType("video/webm")).toBeNull();
    expect(normalizeAudioContentType("text/html;charset=utf-8")).toBeNull();
    expect(normalizeAudioContentType("")).toBeNull();
  });
});

describe("pickRecordingMimeType", () => {
  test("prefers webm/opus when the browser supports it", () => {
    expect(pickRecordingMimeType((type) => type.startsWith("audio/webm"))).toBe(
      "audio/webm;codecs=opus"
    );
  });

  test("falls back to mp4 on Safari-like support", () => {
    expect(pickRecordingMimeType((type) => type === "audio/mp4")).toBe(
      "audio/mp4"
    );
  });

  test("returns undefined when nothing matches, letting the browser choose", () => {
    expect(pickRecordingMimeType(() => false)).toBeUndefined();
  });
});
