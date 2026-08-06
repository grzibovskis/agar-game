export const CHUNK_RELOAD_KEY = "agarcell_chunk_reload_once";

export function getChunkErrorMessage(reason) {
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

export function isChunkLoadErrorText(message) {
  if (!message) {
    return false;
  }

  return /(ChunkLoadError|Loading chunk [\w-]+ failed|Failed to load chunk|dynamic import|Importing a module script failed|_next\/static\/chunks)/i.test(
    message
  );
}

export function hasChunkReloaded() {
  try {
    return window.sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1";
  } catch {
    return false;
  }
}

export function markChunkReloaded() {
  try {
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
  } catch {}
}

export function clearChunkReloadMarker() {
  try {
    window.sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  } catch {}
}