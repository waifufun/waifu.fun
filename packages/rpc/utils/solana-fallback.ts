import { SolanaRpcProvider } from "../src/index"

const RETRYABLE_HTTP_CODES = new Set([429, 503]);

function shouldFallback(error: any): boolean {
  const status = error?.response?.status || error?.statusCode || error?.code;

  if (typeof status === "number" && RETRYABLE_HTTP_CODES.has(status)) {
    return true;
  }

  const msg = error?.message?.toLowerCase() || "";
  return msg.includes("timeout") || msg.includes("network");
}


export default function withFallback<TArgs extends any[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  ctx: SolanaRpcProvider
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs) => {
    try {
      return await fn.apply(ctx, args);
    } catch (error) {
      if (!shouldFallback(error)) {
        throw error;
      }
      const fallback = await SolanaRpcProvider.connect(ctx.networkId);
      return await fn.apply(fallback, args);
    }
  };
}
