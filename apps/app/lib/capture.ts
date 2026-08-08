// Pure helpers for the capture flow, shared by the recorder component and
// the upload route so both sides enforce the same contract.

/**
 * The MIME type stored on the source and sent to Blob storage: parameters
 * (";codecs=opus") stripped, non-audio rejected. MediaRecorder reports
 * parameterized types; AssemblyAI and the allowedContentTypes check both
 * want the bare container type.
 */
export const normalizeAudioContentType = (mime: string): string | null => {
  const bare = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  return bare.startsWith("audio/") && bare.length > "audio/".length
    ? bare
    : null;
};

/** Every bare container type the upload route accepts. */
export const ACCEPTED_AUDIO_CONTENT_TYPES = [
  "audio/aac",
  "audio/flac",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/x-wav",
] as const;

// Preference order: Opus in WebM (Chrome, Edge, Firefox — best quality per
// byte), then MP4/AAC (Safari). isTypeSupported is injected so the choice
// is testable outside a browser.
const RECORDING_PREFERENCES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
] as const;

export const pickRecordingMimeType = (
  isTypeSupported: (type: string) => boolean
): string | undefined =>
  RECORDING_PREFERENCES.find((type) => isTypeSupported(type));

const extensionFor = (contentType: string): string => {
  if (contentType === "audio/mp4" || contentType === "audio/x-m4a") {
    return "m4a";
  }
  if (contentType === "audio/mpeg") {
    return "mp3";
  }
  if (contentType === "audio/wav" || contentType === "audio/x-wav") {
    return "wav";
  }
  if (contentType === "audio/ogg") {
    return "ogg";
  }
  if (contentType === "audio/aac") {
    return "aac";
  }
  if (contentType === "audio/flac") {
    return "flac";
  }
  return "webm";
};

/**
 * Where one voice memo goes and what it says it is. Both halves belong
 * together: Blob derives the content type from the pathname extension unless
 * the upload declares one, and ".webm" maps to video/webm — which the
 * audio-only `allowedContentTypes` on the signed token rejects. So
 * `contentType` must be passed to `uploadPresigned` alongside the pathname.
 */
export const voiceUploadTarget = (
  contentType: string,
  timestamp: number
): { contentType: string; pathname: string } => ({
  contentType,
  pathname: `voice/memo-${timestamp}.${extensionFor(contentType)}`,
});
