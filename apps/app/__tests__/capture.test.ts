import { describe, expect, test } from "bun:test";
import {
  ACCEPTED_AUDIO_CONTENT_TYPES,
  normalizeAudioContentType,
  pickRecordingMimeType,
  voiceUploadTarget,
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

// Mirrors VOICE_PREFIX_REGEX in the upload route, which rejects any pathname
// that does not sit directly under voice/.
const VOICE_PREFIX_REGEX = /^voice\/[^/]+$/;

describe("voiceUploadTarget", () => {
  test("carries the recorded audio type, not the one implied by the extension", () => {
    // Blob derives contentType from the pathname extension when the upload
    // does not declare one, and ".webm" maps to video/webm — rejected by the
    // audio-only allowedContentTypes on the signed token.
    const target = voiceUploadTarget("audio/webm", 1_700_000_000_000);
    expect(target.pathname).toBe("voice/memo-1700000000000.webm");
    expect(target.contentType).toBe("audio/webm");
  });

  test("always declares a type the upload route accepts", () => {
    for (const contentType of ACCEPTED_AUDIO_CONTENT_TYPES) {
      const target = voiceUploadTarget(contentType, 0);
      expect([...ACCEPTED_AUDIO_CONTENT_TYPES] as string[]).toContain(
        target.contentType
      );
      expect(target.pathname).toMatch(VOICE_PREFIX_REGEX);
    }
  });

  test("names the file after the container the browser produced", () => {
    expect(voiceUploadTarget("audio/mp4", 0).pathname).toEndWith(".m4a");
    expect(voiceUploadTarget("audio/mpeg", 0).pathname).toEndWith(".mp3");
    expect(voiceUploadTarget("audio/ogg", 0).pathname).toEndWith(".ogg");
    expect(voiceUploadTarget("audio/wav", 0).pathname).toEndWith(".wav");
  });
});
