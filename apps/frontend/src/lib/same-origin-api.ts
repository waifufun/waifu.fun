/**
 * Same-origin base URL for credentialed XHR calls.
 *
 * Mobile in-app browser WebViews (zerion, MetaMask mobile, Trust, etc) block
 * cookies on cross-origin XHR even within the same registrable domain. A
 * fetch() from waifu.fun -> api.waifu.fun with credentials:include refuses to
 * send the HttpOnly wf_session cookie under WebView privacy rules.
 *
 * Top-level navigation works fine (typing the URL, OAuth redirects) -- only
 * XHR is affected. So the OAuth start/finalize redirect flows still use the
 * cross-origin NEXT_PUBLIC_API_URL.
 *
 * For credentialed XHR, use this empty-string base. Routes resolve to the
 * current origin (waifu.fun or dev.waifu.fun). The CF Pages function in
 * functions/[[path]].js intercepts /v2/* and /v3/* and proxies them
 * server-to-server to api.waifu.fun, forwarding the session cookie.
 *
 * Confirmed mobile WebView XHR cookie block: zerion 2026-05-21.
 */
export const SAME_ORIGIN_API = "";
