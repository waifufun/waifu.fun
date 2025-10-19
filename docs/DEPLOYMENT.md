## Deployment Guide: Multi-Chain auto.fun

Complete guide for deploying auto.fun with Jeju, Base, BSC, and Solana support.

## Pre-Deployment Checklist

### Infrastructure

- [ ] Domain name configured
- [ ] SSL certificates ready
- [ ] CDN configured (Cloudflare, Vercel, etc.)
- [ ] Database provisioned (MongoDB/PostgreSQL)
- [ ] Redis instance ready
- [ ] RPC nodes accessible (or API keys obtained)

### Credentials

- [ ] WalletConnect Project ID
- [ ] Alchemy API key (for Base/Ethereum)
- [ ] Helius API key (for Solana)
- [ ] BSC RPC URL (or use public endpoint)
- [ ] JWT secret generated
- [ ] Database credentials secured

### Contracts

- [ ] Contracts deployed to Jeju mainnet
- [ ] Contracts deployed to Base (if supporting)
- [ ] Contracts deployed to BSC (if supporting)
- [ ] Contract addresses documented
- [ ] Contracts verified on block explorers

## Environment Configuration

### Production `.env`

```bash
# ===== NODE CONFIGURATION =====
NODE_ENV=production
NEXT_PUBLIC_NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://auto.fun
NEXT_PUBLIC_API_URL=https://api.auto.fun

# ===== JEJU =====
NEXT_PUBLIC_JEJU_NETWORK=mainnet
JEJU_RPC_URL=https://rpc.jeju.network
JEJU_WS_URL=wss://ws.jeju.network
JEJU_EXPLORER_URL=https://explorer.jeju.network

# Jeju Contract Addresses
JEJU_UNISWAP_V4_ROUTER=0x... # TODO: Deploy
JEJU_WETH_ADDRESS=0x4200000000000000000000000000000000000006

# ===== BASE =====
NEXT_PUBLIC_ALCHEMY_API_KEY=your_production_alchemy_key

# ===== BSC =====
NEXT_PUBLIC_BSC_RPC_URL=https://bsc-dataseed1.binance.org

# ===== SOLANA =====
NEXT_PUBLIC_HELIUS_API_KEY=your_production_helius_key

# ===== WALLET CONNECTION =====
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_production_project_id

# ===== DATABASE =====
MONGO_URI=mongodb://user:pass@production-mongo:27017/autofun?authSource=admin
REDIS_HOST=production-redis
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# ===== SECURITY =====
JWT_SECRET=your_very_secure_random_string_here
ENCRYPTION_KEY=your_encryption_key_here

# ===== MONITORING =====
SENTRY_DSN=https://your-sentry-dsn
NEXT_PUBLIC_SENTRY_DSN=https://your-sentry-dsn

# ===== ANALYTICS =====
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
```

### Staging `.env`

```bash
NODE_ENV=staging
NEXT_PUBLIC_JEJU_NETWORK=testnet
JEJU_RPC_URL=https://testnet-rpc.jeju.network
# ... other staging values
```

## Deployment Methods

### Option 1: Vercel (Recommended for Frontend)

#### Setup

1. **Connect Repository:**
   ```bash
   # Install Vercel CLI
   npm i -g vercel

   # Login
   vercel login

   # Link project
   cd apps/launchpad
   vercel link
   ```

2. **Configure Environment:**
   ```bash
   # Add all production env vars
   vercel env add NEXT_PUBLIC_JEJU_NETWORK production
   vercel env add NEXT_PUBLIC_ALCHEMY_API_KEY production
   # ... etc
   ```

3. **Configure Build:**

   Create `vercel.json`:
   ```json
   {
     "buildCommand": "bun run build",
     "devCommand": "bun run dev",
     "installCommand": "bun install",
     "framework": "nextjs",
     "outputDirectory": "apps/frontend/.next"
   }
   ```

4. **Deploy:**
   ```bash
   vercel --prod
   ```

#### Auto-Deploy on Push

Vercel automatically deploys on push to main branch.

### Option 2: Docker + Kubernetes

#### Build Images

```bash
# Build launchpad image
cd apps/launchpad
docker build -t autofun-launchpad:latest -f Dockerfile .

# Build OTC agent image
cd apps/thedesk
docker build -t autofun-otc:latest -f Dockerfile .

# Push to registry
docker tag autofun-launchpad:latest registry.example.com/autofun-launchpad:latest
docker push registry.example.com/autofun-launchpad:latest
```

#### Kubernetes Deployment

Create `k8s/launchpad-deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: autofun-launchpad
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: autofun-launchpad
  template:
    metadata:
      labels:
        app: autofun-launchpad
    spec:
      containers:
      - name: launchpad
        image: registry.example.com/autofun-launchpad:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: NEXT_PUBLIC_JEJU_NETWORK
          value: "mainnet"
        - name: MONGO_URI
          valueFrom:
            secretKeyRef:
              name: autofun-secrets
              key: mongo-uri
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: autofun-secrets
              key: jwt-secret
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: autofun-launchpad
  namespace: production
spec:
  selector:
    app: autofun-launchpad
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer
```

Deploy:
```bash
kubectl apply -f k8s/launchpad-deployment.yaml
```

### Option 3: Traditional VPS

#### Setup Server

```bash
# SSH into server
ssh user@your-server.com

# Install dependencies
curl -fsSL https://bun.sh/install | bash
git clone https://github.com/elizaos/autofun-monorepo.git
cd autofun-monorepo

# Install
bun install

# Build
cd apps/launchpad
bun run build
```

#### Configure PM2

```bash
# Install PM2
npm install -g pm2

# Create ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'autofun-launchpad',
    script: 'bun',
    args: 'run start',
    cwd: '/path/to/autofun-monorepo/apps/launchpad',
    env: {
      NODE_ENV: 'production',
      NEXT_PUBLIC_JEJU_NETWORK: 'mainnet',
      // ... other env vars
    }
  }]
};
EOF

# Start
pm2 start ecosystem.config.js

# Save
pm2 save

# Auto-start on reboot
pm2 startup
```

#### Nginx Configuration

```nginx
server {
    listen 80;
    server_name auto.fun www.auto.fun;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name auto.fun www.auto.fun;

    ssl_certificate /etc/letsencrypt/live/auto.fun/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/auto.fun/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Contract Deployment

### Deploy to Jeju Mainnet

```bash
cd apps/launchpad

# Set deployer private key
export DEPLOYER_PRIVATE_KEY=0x...

# Deploy
bun run scripts/deploy-jeju.ts

# Verify contracts
forge verify-contract \
  --chain-id 420691 \
  --compiler-version v0.8.24 \
  $CONTRACT_ADDRESS \
  src/YourContract.sol:YourContract
```

### Update Contract Addresses

Edit `packages/constants/src/index.ts`:

```typescript
export const UNISWAP_V4_ADDRESSES: Record<EvmChainIds, EvmAddressLike> = {
  [EvmChainIds.JejuMainnet]: getAddress("0x..."), // ADD THIS
  // ... other chains
};
```

Rebuild:
```bash
cd packages/constants
bun run build
```

## Database Setup

### MongoDB

```bash
# Create production database
mongosh "mongodb://admin:pass@production-mongo:27017"

use autofun
db.createUser({
  user: "autofun",
  pwd: "secure_password",
  roles: [{ role: "readWrite", db: "autofun" }]
})

# Create indexes
db.tokens.createIndex({ chainId: 1, address: 1 }, { unique: true })
db.tokens.createIndex({ creator: 1 })
db.transactions.createIndex({ hash: 1 }, { unique: true })
```

### Redis

```bash
# Configure Redis for caching
redis-cli
CONFIG SET maxmemory 2gb
CONFIG SET maxmemory-policy allkeys-lru
CONFIG REWRITE
```

## Monitoring

### Health Checks

Create `apps/launchpad/apps/frontend/src/app/api/health/route.ts`:

```typescript
export async function GET() {
  try {
    // Check database
    await mongoose.connection.db.admin().ping();

    // Check Redis
    await redis.ping();

    return Response.json({ status: "healthy" });
  } catch (error) {
    return Response.json({ status: "unhealthy", error }, { status: 500 });
  }
}
```

### Sentry Integration

```typescript
// sentry.client.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
```

### Grafana/Prometheus

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'autofun-launchpad'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/api/metrics'
```

## Post-Deployment

### Verification

- [ ] Homepage loads correctly
- [ ] Can connect wallet
- [ ] Jeju network appears in selector
- [ ] Can switch networks
- [ ] Can create tokens
- [ ] Transactions confirm
- [ ] Block explorer links work
- [ ] Analytics tracking works
- [ ] Error monitoring works

### Performance

```bash
# Run Lighthouse audit
npm install -g lighthouse
lighthouse https://auto.fun --view

# Expected scores:
# Performance: > 90
# Accessibility: > 95
# Best Practices: > 95
# SEO: > 95
```

### Security

```bash
# Run security audit
npm audit

# Check for secrets in code
git secrets --scan

# SSL test
ssllabs.com/ssltest/analyze.html?d=auto.fun
```

## Rollback Procedure

If deployment fails:

1. **Revert to previous version:**
   ```bash
   vercel rollback
   # or
   kubectl rollout undo deployment/autofun-launchpad
   # or
   pm2 restart autofun-launchpad --update-env
   ```

2. **Check logs:**
   ```bash
   vercel logs
   # or
   kubectl logs -f deployment/autofun-launchpad
   # or
   pm2 logs autofun-launchpad
   ```

3. **Restore database (if needed):**
   ```bash
   mongorestore --uri="mongodb://..." backup/
   ```

## Maintenance

### Updating

```bash
# Pull latest code
git pull origin main

# Install dependencies
bun install

# Rebuild
bun run build

# Restart
pm2 restart autofun-launchpad
# or
kubectl rollout restart deployment/autofun-launchpad
```

### Backup

```bash
# Database backup
mongodump --uri="mongodb://..." --out=backup/$(date +%Y%m%d)

# Redis backup
redis-cli --rdb /backup/redis-$(date +%Y%m%d).rdb

# Upload to S3
aws s3 sync backup/ s3://autofun-backups/
```

## Support

- **Issues:** https://github.com/elizaos/autofun-monorepo/issues
- **Docs:** https://docs.auto.fun
- **Discord:** https://discord.gg/autofun
