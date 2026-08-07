"use client";

import { useEffect, useState } from "react";
import {
  clearChunkReloadMarker,
  getChunkErrorMessage,
  hasChunkReloaded,
  isChunkLoadErrorText,
  markChunkReloaded,
} from "@/lib/chunkRecovery";

export default function ChunkErrorRecovery() {
  const [showPersistentError, setShowPersistentError] = useState(false);

  useEffect(() => {
    clearChunkReloadMarker();

    function handleChunkError(reason) {
      const message = getChunkErrorMessage(reason);

      if (!isChunkLoadErrorText(message)) {
        return;
      }

      console.error("[ChunkErrorRecovery] ChunkLoadError detected", { message });

      const alreadyReloaded = hasChunkReloaded();

      if (!alreadyReloaded) {
        markChunkReloaded();
        console.info("[ChunkErrorRecovery] Triggering one-time reload fallback");
        window.location.reload();
        return;
      }

      setShowPersistentError(true);
    }

    function onWindowError(event) {
      handleChunkError(event.error || event.message);
    }

    function onUnhandledRejection(event) {
      handleChunkError(event.reason);
    }

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  if (!showPersistentError) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 top-0 z-[120] bg-red-700/95 px-4 py-3 text-sm text-white">
      Update could not be loaded from the network. Please hard refresh (Ctrl+F5) or try another network.
    </div>
  );
}
