import {
  clearChunkReloadMarker,
  getChunkErrorMessage,
  hasChunkReloaded,
  isChunkLoadErrorText,
  markChunkReloaded,
} from "@/lib/chunkRecovery";

function handleChunkFailure(reason) {
  const message = getChunkErrorMessage(reason);

  if (!isChunkLoadErrorText(message)) {
    return;
  }

  console.error("[instrumentation-client] Chunk load failure detected", { message });

  if (hasChunkReloaded()) {
    return;
  }

  markChunkReloaded();
  window.location.reload();
}

try {
  window.addEventListener("error", (event) => {
    handleChunkFailure(event.error || event.message);
  });

  window.addEventListener("unhandledrejection", (event) => {
    handleChunkFailure(event.reason);
  });

  window.addEventListener(
    "pageshow",
    () => {
      clearChunkReloadMarker();
    },
    { once: true }
  );
} catch (error) {
  console.error("[instrumentation-client] failed to initialize chunk recovery", error);
}