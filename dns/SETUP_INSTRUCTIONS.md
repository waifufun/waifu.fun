# Waifu Testing on shad0w.xyz — DNS & SSL Setup

## Overview

We're setting up temporary subdomains on `shad0w.xyz` for waifu.fun testing:
- **Frontend**: `waifu.shad0w.xyz` → Vercel (already added to project)
- **API**: `waifu-api.shad0w.xyz` → Hetzner VPS `89.167.63.246`

> ⚠️ We use `waifu-api.shad0w.xyz` (NOT `api.waifu.shad0w.xyz`) because
> Cloudflare's free Universal SSL only covers `*.shad0w.xyz` (one level),
> not `*.waifu.shad0w.xyz` (two levels deep).

## Current Architecture

Your `shad0w.xyz` zone uses:
- Cloudflare DNS with nameservers: `naya.ns.cloudflare.com`, `harvey.ns.cloudflare.com`
- A Cloudflare Tunnel (`milady-backend`) for `*.shad0w.xyz` wildcard routing
- The tunnel runs on **two** origin servers (89.167.63.246 + 188.245.252.86)

## What's Already Done ✅

1. **Nginx on VPS** (89.167.63.246):
   - `waifu-api.shad0w.xyz` server block on port 80 + 443 (self-signed cert)
   - Port 8080 server block for tunnel traffic
   - CORS headers configured (allow all origins)
   - Proxies to waifu-core backend on `localhost:3100`

2. **Vercel**:
   - `waifu.shad0w.xyz` added as a domain to the waifu.fun Vercel project

3. **SSL prep**:
   - Self-signed cert at `/etc/nginx/ssl/shad0w.xyz.crt` (for Cloudflare Full SSL)
   - Certbot setup script at `/root/setup-waifu-ssl.sh` (run after DNS is configured)

---

## Shadow's Manual Steps (Cloudflare Dashboard)

### Step 1: Add API DNS Record

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select the `shad0w.xyz` zone
3. Go to **DNS** → **Records**
4. Add new record:
   - **Type**: `A`
   - **Name**: `waifu-api`
   - **IPv4 address**: `89.167.63.246`
   - **Proxy status**: ⚠️ **DNS only (grey cloud)** — toggle OFF the orange cloud
   - **TTL**: Auto
5. Click **Save**

> **Why DNS-only?** The Cloudflare Tunnel catches `*.shad0w.xyz` traffic. A proxied
> record would go through the tunnel which load-balances between two servers.
> DNS-only sends traffic directly to the waifu VPS.

### Step 2: Add Frontend DNS Record

1. Still in Cloudflare DNS for `shad0w.xyz`
2. Add new record:
   - **Type**: `CNAME`
   - **Name**: `waifu`
   - **Target**: `cname.vercel-dns.com`
   - **Proxy status**: ⚠️ **DNS only (grey cloud)** — toggle OFF the orange cloud
   - **TTL**: Auto
3. Click **Save**

> **Why DNS-only?** Vercel handles SSL automatically. The Cloudflare proxy
> would interfere with Vercel's SSL cert issuance.

### Step 3: Get SSL Certificate (on VPS)

After DNS propagates (usually 1-5 minutes), SSH to the VPS and run:

```bash
ssh root@89.167.63.246
/root/setup-waifu-ssl.sh
```

This script will:
- Verify DNS resolves correctly
- Get a Let's Encrypt SSL certificate via certbot
- Update nginx config to use the real cert
- Reload nginx

### Step 4: Update Vercel Environment Variable

In the Vercel dashboard (or CLI), update the `NEXT_PUBLIC_API_URL` for testing:

```bash
cd /home/shad0w/projects/waifu.fun
npx vercel env rm NEXT_PUBLIC_API_URL production
echo "https://waifu-api.shad0w.xyz" | npx vercel env add NEXT_PUBLIC_API_URL production
npx vercel --prod
```

Or keep it at `https://api.waifu.fun` and only change for local testing.

---

## Verification

After setup, test everything:

```bash
# Test API (should return health JSON)
curl https://waifu-api.shad0w.xyz/health

# Test frontend (should return HTML)
curl -sI https://waifu.shad0w.xyz/ | head -5

# Test API CORS
curl -sI -H "Origin: https://waifu.shad0w.xyz" https://waifu-api.shad0w.xyz/health | grep -i access-control
```

---

## Final URLs

| Service  | URL                                | Status |
|----------|------------------------------------|--------|
| Frontend | `https://waifu.shad0w.xyz`         | ⏳ Needs DNS record |
| API      | `https://waifu-api.shad0w.xyz`     | ⏳ Needs DNS record + SSL |
| API (temp) | `http://89.167.63.246` (port 80) | ✅ Working now |

---

## Quick Reference

- **VPS**: `root@89.167.63.246`
- **Nginx configs**: `/etc/nginx/sites-available/waifu-api`, `/etc/nginx/sites-available/waifu-tunnel`
- **SSL script**: `/root/setup-waifu-ssl.sh`
- **API backend**: `localhost:3100` (waifu-core, managed by pm2)
- **Certbot auto-renew**: Already set up via systemd timer
- **Vercel project**: `waifu.fun` under `sols-projects-6a5ae965`
