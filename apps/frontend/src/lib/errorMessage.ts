
const statusMessages: Record<number, string> = {
  401: "Unauthorized. Please log in again.",
  403: "Access denied. You don't have permission for this action.",
  404: "Resource not found.",
  429: "Too many requests. Please try again later.",
};

function pluck<T = any>(obj: any, paths: string[]): T | undefined {
  for (const path of paths) {
    const parts = path.split(".");
    let val: any = obj;
    for (const key of parts) {
      if (val == null) break;
      val = val[key];
    }
    if (val != null) {
      return val as T;
    }
  }
  return undefined;
}

function safeStringify(error: unknown, maxLen = 500): string {
  try {
    const str = JSON.stringify(error, null, 2);
    return str.length > maxLen ? str.slice(0, maxLen) + "…" : str;
  } catch {
    try {
      return String(error);
    } catch {
      return "An unknown error occurred";
    }
  }
}

export function getErrorMessage(error: unknown): string {

  if (error === null || error === undefined) {
    return "An unknown error occurred";
  }

  if (error instanceof Error) {
    const msg = error.message || "";
    if (/fetch|network/i.test(msg)) {
      return "Network error. Please check your connection and try again.";
    }
    if (/timeout/i.test(msg)) {
      return "Request timed out. Please try again.";
    }
    return msg || "An unknown error occurred";
  }

  // API-like error structure
  const apiMsg = pluck<string>(error, [
    "response.data.message",
    "response.data.error",
    "data.message",
    "data.error",
    "message",
    "error",
    "reason",
  ]);
  if (apiMsg) {
    return apiMsg;
  }

  // HTTP-like status code 
  const status = (error as any).status;
  if (typeof status === "number") {
    return (
      statusMessages[status] ??
      (status >= 500 ? "Server error. Please try again later." : `HTTP Error ${status}`)
    );
  }

  //Solana logs array
  const logs = (error as any).logs;
  if (Array.isArray(logs)) {
    const found = logs.find((log: string) =>
      /error|failed|rejected/i.test(log)
    );
    if (found) return found;
  }

  if (typeof error === "string") {
    const trimmed = error.trim();
    return trimmed || "An unknown error occurred";
  }
  if (typeof error === "number") {
    return `Error code: ${error}`;
  }

  // Fallback
  return safeStringify(error);
}