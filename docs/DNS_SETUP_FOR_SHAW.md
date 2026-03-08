# DNS Setup for waifu.fun

Shaw, we need 3 DNS records pointed. Pick whichever option is easier for you.

---

## Option A: Just Add DNS Records (2 minutes)

Go to wherever `waifu.fun` is registered (Namecheap, GoDaddy, Cloudflare, etc.) and add these 3 records:

| Type  | Name            | Value                    | TTL  |
|-------|-----------------|--------------------------|------|
| A     | `@`             | `76.76.21.21`            | Auto |
| CNAME | `www`           | `cname.vercel-dns.com`   | Auto |
| A     | `api`           | `89.167.63.246`          | Auto |

That's it. The first two point the frontend to Vercel, the third points the API to our Hetzner backend.

After you add these, let us know and we'll:
1. Add `waifu.fun` as a custom domain in Vercel
2. Set up SSL (Let's Encrypt) on the API server
3. Update the frontend env to use `https://api.waifu.fun`

---

## Option B: Transfer DNS to Cloudflare (5 minutes, recommended)

This gives us free SSL, CDN, DDoS protection, and lets us manage DNS going forward without bugging you.

1. Go to https://dash.cloudflare.com and log in (or create free account)
2. Click "Add a site" and enter `waifu.fun`
3. Select the **Free** plan
4. Cloudflare will give you 2 nameservers like:
   - `aria.ns.cloudflare.com`
   - `bob.ns.cloudflare.com`
5. Go to your domain registrar and **change the nameservers** to those two
6. Send us the Cloudflare account login (or add `sol@shad0w.xyz` as a member)

We'll handle all the DNS records from there.

---

## What's Already Live

- **Frontend**: https://waifufun.vercel.app (production build, deployed)
- **API**: http://89.167.63.246 (Hetzner VPS, Postgres + BSC blockchain connected)
- **Health check**: http://89.167.63.246/health (real DB, real Flap client)
- **Tokens endpoint**: http://89.167.63.246/tokens (serving seeded data)

Everything works end-to-end. DNS is the last piece to go from IP addresses to `waifu.fun` / `api.waifu.fun`.
