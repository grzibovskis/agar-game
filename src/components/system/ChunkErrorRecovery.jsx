"use client";

import { useEffect, useState } from "react";

const RELOAD_KEY = "agargame_chunk_reload_once";

function getErrorMessage(reason) {
  if (!reason) {
    return "";
  }

  if (typeof reason === "string") {
    return reason;
  }

  if (reason instanceof Error) {
    return `${reason.name}: ${reason.message}`;
  }

  if (typeof reason.message === "string") {
    return reason.message;
  }

  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

function isChunkLoadErrorText(message) {
  if (!message) {
    return false;
  }

  return /(ChunkLoadError|Loading chunk [\w-]+ failed|Failed to load chunk|dynamic import|Importing a module script failed|_next\/static\/chunks)/i.test(
    message
  );
}

export default function ChunkErrorRecovery() {
  const [showPersistentError, setShowPersistentError] = useState(false);

  useEffect(() => {
    function handleChunkError(reason) {
      const message = getErrorMessage(reason);

      if (!isChunkLoadErrorText(message)) {
        return;
      }

      console.error("[ChunkErrorRecovery] ChunkLoadError detected", { message });

      const alreadyReloaded = sessionStorage.getItem(RELOAD_KEY) === "1";

      if (!alreadyReloaded) {
        sessionStorage.setItem(RELOAD_KEY, "1");
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
