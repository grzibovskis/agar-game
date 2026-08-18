"use client";

import { useEffect, useState } from "react";
import {
  getChunkErrorMessage,
  isChunkLoadErrorText,
} from "@/lib/chunkRecovery";

export default function ChunkErrorRecovery() {
  const [showPersistentError, setShowPersistentError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    function handleChunkError(reason) {
      const message = getChunkErrorMessage(reason);

      if (!isChunkLoadErrorText(message)) {
        return;
      }

      console.error("[ChunkErrorRecovery] ChunkLoadError detected", { message });
      setErrorMessage(message);
      setShowPersistentError(true);
    }

    function onWindowError(event) {
      handleChunkError(event.error || event.message);
    }

    function onUnhandledRejection(event) {
      handleChunkError(event.reason);
    }

    function onChunkFailure(event) {
      handleChunkError(event?.detail?.message);
    }

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("agar:chunk-failure", onChunkFailure);

    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("agar:chunk-failure", onChunkFailure);
    };
  }, []);

  if (!showPersistentError) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 top-0 z-[120] flex flex-wrap items-center gap-3 bg-red-700/95 px-4 py-3 text-sm text-white">
      <span>
        Update could not be loaded from the network. Reload to recover.
        {errorMessage ? ` (${errorMessage})` : ""}
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-md bg-white px-3 py-1 font-semibold text-red-700"
      >
        Reload page
      </button>
    </div>
  );
}
