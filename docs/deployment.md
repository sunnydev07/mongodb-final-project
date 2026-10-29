# Deployment

## 1. Deployment options

| Option | Use case | Files |
| --- | --- | --- |
| Local Node process | Development / demo | `npm start`, `npm run dev` |
| Docker image | Portable single-container deployment | `deploy/Dockerfile` |
| Docker Compose (app + MongoDB) | Single-host demo/production starter | `deploy/docker-compose.yml` |
| Docker Compose (3-node replica set) | Replication/failover testing | `deploy/docker-compose.replica.yml` |
| Process manager + external MongoDB | VM/bare-metal deployment | PM2 or systemd, `MONGODB_URI` |
| GitHub Actions | Continuous integration | `.github/workflows/ci.yml` |

> Docker is not installed in the authoring environment. The Docker and Compose files are provided and documented here, but only the local Node + MongoDB path was executed. The Dockerfile uses `node:22-alpine`, matching the project's Node 20.19+ requirement.

## 2. Runtime requirements

- Node.js **20.19+** (Mongoose 9 and the MongoDB 7 driver require it).
- MongoDB **6+**; MongoDB 7/8 recommended.
- Environment variables from `.env.example`.
- A strong `JWT_SECRET` in production. The app refuses to start in production if the default secret is used.

## 3. Docker image

`deploy/Dockerfile` is a multi-stage build:

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY scripts ./scripts
COPY package.json ./
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1
CMD ["node", "src/server.js"]
```

Why this shape:

- dependencies are installed once in the `deps` stage;
- the runtime image contains only production dependencies and source;
- `NODE_ENV=production` disables auto-indexing and stack traces;
- the health check lets orchestrators restart unhealthy containers;
- `npm ci` requires `package-lock.json`, ensuring reproducible installs.

Build and run:

```bash
docker build -f deploy/Dockerfile -t mongodb-final-project .
docker run --rm -p 4000:4000 \
  -e NODE_ENV=production \
  -e MONGODB_URI="mongodb://host.docker.internal:27017/mongo_final_project" \
  -e JWT_SECRET="replace-with-a-long-random-secret" \
  mongodb-final-project
```

On Linux, `host.docker.internal` may require `--add-host=host.docker.internal:host-gateway` or a user-defined network.

## 4. Compose: app + standalone MongoDB

From the project root:

```bash
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml logs -f app
```

Services:

| Service | Image/build | Port | Notes |
| --- | --- | --- | --- |
| `mongo` | `mongo:7` | 27017 | Named volume `mongo_data`; health check |
| `app` | local Dockerfile | 4000 | Waits for Mongo health; mounts `../backups` |

The app service uses:

```yaml
environment:
  NODE_ENV: production
  PORT: 4000
  MONGODB_URI: mongodb://mongo:27017/mongo_final_project
  JWT_SECRET: ${JWT_SECRET:-change-me-in-production}
```

Set `JWT_SECRET` in the shell or a `.env` file next to the Compose file. The fallback value is only for local demos and will be rejected by the app in production mode.

Initialize indexes and optional demo data once the containers are healthy:

```bash
docker compose -f deploy/docker-compose.yml exec app node scripts/createIndexes.js
docker compose -f deploy/docker-compose.yml exec app node scripts/seed.js
```

Seed data is for demos only; never seed a real production database.

Stop and remove:

```bash
docker compose -f deploy/docker-compose.yml down
# also delete the database volume
docker compose -f deploy/docker-compose.yml down -v
```

## 5. Compose: three-node replica set

```bash
docker compose -f deploy/docker-compose.replica.yml up -d
```

This starts:

| Container | Host port | Internal hostname |
| --- | ---: | --- |
| `mongo-rs0` | 27017 | `mongo1:27017` |
| `mongo-rs1` | 27018 | `mongo2:27017` |
| `mongo-rs2` | 27019 | `mongo3:27017` |

Initiate the set using **container hostnames**, not `localhost`:

```bash
docker exec -it mongo-rs0 mongosh --eval '
  rs.initiate({
    _id: "rs0",
    members: [
      { _id: 0, host: "mongo1:27017", priority: 2 },
      { _id: 1, host: "mongo2:27017", priority: 1 },
      { _id: 2, host: "mongo3:27017", priority: 1 }
    ]
  })
'
```

Check:

```bash
docker exec -it mongo-rs0 mongosh --eval "rs.status()"
```

Run the app on the host against the exposed ports:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017,127.0.0.1:27018,127.0.0.1:27019/?replicaSet=rs0
```

Or add an app service to the Compose file using:

```yaml
environment:
  MONGODB_URI: mongodb://mongo1:27017,mongo2:27017,mongo3:27017/?replicaSet=rs0
```

The app must start after `rs.initiate()` completes. Add a health check/retry policy (or an init job) so the app does not exhaust its 5-second server-selection timeout during the first election.

## 6. VM / bare metal with a process manager

### PM2

```bash
npm ci --omit=dev
npm run indexes
pm2 start src/server.js --name mongodb-final-api
pm2 save
pm2 startup
```

PM2 restarts the process on crash and on boot. Use `pm2 logs` and `pm2 monit`.

### systemd

```ini
[Unit]
Description=MongoDB Final Project API
After=network.target

[Service]
Type=simple
User=mongoapp
WorkingDirectory=/opt/mongodb-final-project
EnvironmentFile=/opt/mongodb-final-project/.env
ExecStart=/usr/bin/node src/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mongodb-final-api
sudo journalctl -u mongodb-final-api -f
```

## 7. Reverse proxy and TLS

Terminate TLS at Nginx, Caddy, or a cloud load balancer; keep Node on a private port.

```nginx
server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    client_max_body_size 2m;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Set `CORS_ORIGIN` to the real frontend origin(s) instead of `*`. If the API is behind a proxy, configure Express `trust proxy` and rate-limit keying appropriately.

## 8. Environment and secrets

| Variable | Production guidance |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | `4000` (or the platform-provided port) |
| `MONGODB_URI` | Replica-set URI with auth, e.g. `mongodb://user:pass@h1,h2,h3/db?replicaSet=rs0&authSource=admin` |
| `JWT_SECRET` | 32+ random bytes from a secret manager |
| `JWT_EXPIRES_IN` | Short-lived access token, e.g. `15m`, with refresh tokens |
| `CORS_ORIGIN` | Explicit frontend origin(s) |
| `RATE_LIMIT_MAX` | Tune to traffic; use a shared store for multiple replicas |
| `MONGO_POOL_SIZE` | Tune per instance and MongoDB connection limits |
| `BACKUP_DIR` | Persistent volume, not container-local storage |

Never commit `.env`. Use Docker secrets, Kubernetes Secrets, AWS Secrets Manager, or the platform's secret store.

## 9. Operational checklist

### Before first deploy

- [ ] `npm ci` succeeds from the lockfile.
- [ ] `npm test` and `npm run lint` pass.
- [ ] `JWT_SECRET` is strong and stored outside the image.
- [ ] MongoDB is a replica set with authentication and TLS.
- [ ] `CORS_ORIGIN` is restricted.
- [ ] Indexes are created deliberately (`autoIndex` is off in production).
- [ ] Backups are configured, encrypted, offsite, and retention is set.
- [ ] Health endpoint and logs are monitored.
- [ ] Rate limiting uses a shared store if running multiple app replicas.

### On every deploy

1. Build and scan the image.
2. Run tests in CI.
3. Apply schema/index changes (`npm run indexes` or a migration job).
4. Roll out with a health check and rollback plan.
5. Verify `/health`, login, product list, and order read paths.
6. Watch error rate, latency, and MongoDB metrics.

### Rollback

Keep the previous image tag. Because MongoDB schema changes are additive in this project, rolling back the app is usually safe. For destructive migrations, take a backup and define a forward-fix plan rather than assuming a reversible rollback.

## 10. CI pipeline

`.github/workflows/ci.yml` runs on pushes and pull requests to `main`:

1. start a `mongo:7` service container;
2. install with `npm ci`;
3. run ESLint;
4. run all 30 Jest tests;
5. seed the database, sync indexes, and run the benchmark.

This catches dependency, lint, test, seed, index, and benchmark regressions on every change. The workflow uses Node 22 and a service health check before running steps.

## 11. Scaling notes

- **Stateless API**: any number of app replicas can sit behind a load balancer.
- **Sessions**: JWT is stateless, so no sticky sessions are required.
- **Rate limiting**: the default in-memory store is per process; use Redis or another shared store for multi-instance deployments.
- **MongoDB**: use a replica set; add secondaries for read scaling and analytics if needed.
- **Indexes**: every app instance should not race to create them at boot in production; run index creation as a deployment job.
- **Backups**: run from a secondary and store offsite.
- **Observability**: add structured logs, request IDs, metrics (latency, error rate, DB pool), and tracing before scaling traffic.
