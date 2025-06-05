 export function ensureObject<T = unknown>(value: string | T): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch (err) {
      return value as unknown as T;
    }
  }
  return value;
}