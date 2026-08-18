import {
  getChunkErrorMessage,
  isChunkLoadErrorText,
} from "@/lib/chunkRecovery";

function handleChunkFailure(reason) {
  const message = getChunkErrorMessage(reason);

  if (!isChunkLoadErrorText(message)) {
    return;
  }

  console.error("[instrumentation-client] Chunk load failure detected", { message });

  // Let UI decide if/when to reload. Avoid automatic navigation loops.
  window.dispatchEvent(
    new CustomEvent("agar:chunk-failure", {
      detail: { message },
    })
  );
}

try {
  window.addEventListener("error", (event) => {
    handleChunkFailure(event.error || event.message);
  });

  window.addEventListener("unhandledrejection", (event) => {
    handleChunkFailure(event.reason);
  });
} catch (error) {
  console.error("[instrumentation-client] failed to initialize chunk recovery", error);
}