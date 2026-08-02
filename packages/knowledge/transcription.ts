import type { Db, ObjectId } from "mongodb";
import { getCollections } from "./collections";

// The transcription stage: voice source audio → AssemblyAI (EU endpoint) →
// source.content, ready for extraction. Same operating rules as the
// extraction worker: injectable I/O, idempotent progress, and a failure
// budget instead of infinite retries.

export interface TranscriptResult {
  languageCode?: string;
  text: string;
}

export interface RunTranscriptionOptions {
  /** Failed attempts before the source flips to "failed". Default 3. */
  maxAttempts?: number;
  sourceId: ObjectId;
  /** The transcription call. Injectable so tests and providers stay decoupled. */
  transcribe: (audioUrl: string) => Promise<TranscriptResult>;
}

export interface TranscriptionRunResult {
  reason?: string;
  status: "failed" | "retry" | "transcribed";
}

// Data minimization (GDPR Art. 5): categories a company brain must never
// store, redacted at the transcription provider so they never reach the
// database. Names, organizations, and money amounts deliberately stay —
// they ARE the product's signal.
export const DEFAULT_PII_POLICIES = [
  "account_number",
  "banking_information",
  "blood_type",
  "credit_card_cvv",
  "credit_card_expiration",
  "credit_card_number",
  "drivers_license",
  "drug",
  "healthcare_number",
  "injury",
  "medical_condition",
  "medical_process",
  "passport_number",
  "us_social_security_number",
] as const;

export interface AssemblyAiConfig {
  apiKey?: string;
  /** Default: the EU data-residency endpoint. */
  baseUrl?: string;
  piiPolicies?: readonly string[];
  pollIntervalMs?: number;
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = "https://api.eu.assemblyai.com";
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 180_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const createAssemblyAiTranscriber = (
  config: AssemblyAiConfig = {}
): ((audioUrl: string) => Promise<TranscriptResult>) => {
  const apiKey = config.apiKey ?? process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ASSEMBLYAI_API_KEY is required (pass config.apiKey or set the env var)"
    );
  }
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const piiPolicies = config.piiPolicies ?? DEFAULT_PII_POLICIES;
  const pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headers = { authorization: apiKey };

  return async (audioUrl: string): Promise<TranscriptResult> => {
    const createRes = await fetch(`${baseUrl}/v2/transcript`, {
      body: JSON.stringify({
        audio_url: audioUrl,
        language_detection: true,
        redact_pii: true,
        redact_pii_policies: piiPolicies,
        redact_pii_sub: "entity_name",
        speaker_labels: true,
      }),
      headers: { ...headers, "content-type": "application/json" },
      method: "POST",
    });
    if (!createRes.ok) {
      throw new Error(
        `assemblyai ${createRes.status}: ${(await createRes.text()).slice(0, 300)}`
      );
    }
    const created = (await createRes.json()) as { id: string };

    const started = Date.now();
    for (;;) {
      // biome-ignore lint/performance/noAwaitInLoops: polling a job status is inherently sequential — each wait depends on the previous poll's answer
      await sleep(pollIntervalMs);
      const pollRes = await fetch(`${baseUrl}/v2/transcript/${created.id}`, {
        headers,
      });
      if (!pollRes.ok) {
        throw new Error(`assemblyai poll ${pollRes.status}`);
      }
      const transcript = (await pollRes.json()) as {
        error?: string;
        language_code?: string;
        status: string;
        text?: string;
      };
      if (transcript.status === "completed") {
        return {
          languageCode: transcript.language_code,
          text: transcript.text ?? "",
        };
      }
      if (transcript.status === "error") {
        throw new Error(`assemblyai transcription error: ${transcript.error}`);
      }
      if (Date.now() - started > timeoutMs) {
        throw new Error(
          `assemblyai transcription timed out after ${timeoutMs}ms`
        );
      }
    }
  };
};

export const runTranscription = async (
  db: Db,
  tenantId: string,
  { maxAttempts = 3, sourceId, transcribe }: RunTranscriptionOptions
): Promise<TranscriptionRunResult> => {
  const { sources } = getCollections(db);
  const source = await sources.findOne({ _id: sourceId, tenantId });
  if (!source) {
    throw new Error(`Source ${sourceId.toHexString()} not found`);
  }
  // Already past this stage (including a crashed run that wrote content but
  // not the status): nothing to do.
  if (source.content && source.status !== "received") {
    return { status: "transcribed" };
  }
  if (source.type !== "voice") {
    throw new Error(`Source type "${source.type}" does not need transcription`);
  }
  if (!(source.status === "received" || source.status === "transcribing")) {
    throw new Error(
      `Source status "${source.status}" is not transcribable — expected received or transcribing`
    );
  }
  const audioUrl = source.audio?.blobUrl;
  if (!audioUrl) {
    throw new Error("Voice source has no audio blob to transcribe");
  }

  await sources.updateOne(
    { _id: sourceId, tenantId },
    { $set: { status: "transcribing", updatedAt: new Date() } }
  );

  let failure: string | null = null;
  let text = "";
  try {
    const result = await transcribe(audioUrl);
    text = result.text.trim();
    if (text.length === 0) {
      failure = "transcription returned empty text";
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }

  const writtenAt = new Date();
  if (failure === null) {
    await sources.updateOne(
      { _id: sourceId, tenantId },
      {
        $set: {
          content: text,
          status: "transcribed",
          transcriptionAttempts: 0,
          updatedAt: writtenAt,
        },
        $unset: { error: "" },
      }
    );
    return { status: "transcribed" };
  }

  const attempts = (source.transcriptionAttempts ?? 0) + 1;
  const exhausted = attempts >= maxAttempts;
  await sources.updateOne(
    { _id: sourceId, tenantId },
    {
      $set: {
        error: failure,
        status: exhausted ? "failed" : "received",
        transcriptionAttempts: attempts,
        updatedAt: writtenAt,
      },
    }
  );
  return { reason: failure, status: exhausted ? "failed" : "retry" };
};
