"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { uploadPresigned } from "@repo/storage/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createVoiceSource } from "@/app/actions/knowledge/create-source";
import {
  normalizeAudioContentType,
  pickRecordingMimeType,
} from "@/lib/capture";

type RecorderState =
  | { kind: "done" }
  | { kind: "error"; message: string }
  | { kind: "idle" }
  | { kind: "recorded"; blob: Blob; objectUrl: string }
  | { kind: "recording" }
  | { kind: "uploading" };

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
  return "webm";
};

const formatSeconds = (total: number): string => {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

export const Recorder = ({ onCaptured }: { onCaptured: () => void }) => {
  const [state, setState] = useState<RecorderState>({ kind: "idle" });
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => stopTimer, [stopTimer]);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const mimeType = pickRecordingMimeType((type) =>
        MediaRecorder.isTypeSupported(type)
      );
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );
      chunksRef.current = [];
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      });
      recorder.addEventListener("stop", () => {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        const contentType =
          normalizeAudioContentType(recorder.mimeType) ?? "audio/webm";
        const blob = new Blob(chunksRef.current, { type: contentType });
        setState({
          blob,
          kind: "recorded",
          objectUrl: URL.createObjectURL(blob),
        });
      });
      recorder.start();
      recorderRef.current = recorder;
      setSeconds(0);
      timerRef.current = setInterval(
        () => setSeconds((value) => value + 1),
        1000
      );
      setState({ kind: "recording" });
    } catch (error) {
      setState({
        kind: "error",
        message:
          error instanceof Error && error.name === "NotAllowedError"
            ? "Microphone access was denied — allow it in the browser and try again."
            : `Could not start recording: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }, []);

  const stop = useCallback(() => {
    stopTimer();
    recorderRef.current?.stop();
  }, [stopTimer]);

  const discard = useCallback(() => {
    if (state.kind === "recorded") {
      URL.revokeObjectURL(state.objectUrl);
    }
    setState({ kind: "idle" });
  }, [state]);

  const submit = useCallback(async () => {
    if (state.kind !== "recorded") {
      return;
    }
    const { blob, objectUrl } = state;
    setState({ kind: "uploading" });
    try {
      const pathname = `voice/memo-${Date.now()}.${extensionFor(blob.type)}`;
      const result = await uploadPresigned(pathname, blob, {
        access: "private",
        handleUploadUrl: "/api/knowledge/upload",
      });
      const created = await createVoiceSource(result.url, blob.type);
      if (created.error) {
        setState({ kind: "error", message: created.error });
        return;
      }
      URL.revokeObjectURL(objectUrl);
      setState({ kind: "done" });
      onCaptured();
    } catch (error) {
      setState({
        kind: "error",
        message: `Upload failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }, [onCaptured, state]);

  if (state.kind === "recording") {
    return (
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-2 font-mono text-sm">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
          {formatSeconds(seconds)}
        </span>
        <Button onClick={stop} type="button" variant="destructive">
          Stop
        </Button>
      </div>
    );
  }

  if (state.kind === "recorded") {
    return (
      <div className="flex flex-col gap-3">
        {/* biome-ignore lint/a11y/useMediaCaption: a just-recorded voice memo has no caption track */}
        <audio className="w-full" controls src={state.objectUrl} />
        <div className="flex gap-2">
          <Button onClick={submit} type="button">
            Save to brain
          </Button>
          <Button onClick={discard} type="button" variant="outline">
            Discard
          </Button>
        </div>
      </div>
    );
  }

  if (state.kind === "uploading") {
    return <p className="text-muted-foreground text-sm">Uploading…</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {state.kind === "done" ? (
        <p className="text-muted-foreground text-sm">
          Saved. The pipeline transcribes and proposes knowledge within a few
          minutes — watch it below, review it under Review.
        </p>
      ) : null}
      {state.kind === "error" ? (
        <p className="text-destructive text-sm">{state.message}</p>
      ) : null}
      <div>
        <Button onClick={start} type="button">
          {state.kind === "idle" ? "Start recording" : "Record another"}
        </Button>
      </div>
    </div>
  );
};
