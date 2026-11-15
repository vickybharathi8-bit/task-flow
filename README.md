# CloudFront + S3 + Ubuntu deployment lab

A small full-stack **TaskBoard** application designed for the deployment pattern used in your OpsDesk lab:

- React + Vite frontend: build locally, upload the contents of `frontend/dist/` to your S3 frontend prefix.
- Express backend: run on Ubuntu EC2 with PM2 on `127.0.0.1:3005`.
- Nginx: proxy `/opsdesk-api/*` to the Express API.
- CloudFront: serve the S3 frontend and route `/opsdesk-api/*` to the EC2/Nginx origin.

The production frontend uses a **relative API URL** (`/opsdesk-api`). It does not contain an EC2 public IP or a separate API hostname.

## Project structure

```text
CloudFront-Ubuntu-Deployment-Lab/
├── frontend/
│   ├── .env.production
│   ├── .env.development
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       └── style.css
└── backend/
    ├── package.json
    ├── server.js
    └── data/
        └── tasks.json
```

## 1. Build the frontend on Windows

Open PowerShell in the `frontend` folder:

```powershell
npm install
npm run build
```

Check that the build output exists:

```powershell
Get-Content .\dist\index.html
Get-ChildItem .\dist\assets | Select-Object Name,Length
```

The generated `index.html` must reference filenames that actually exist in `dist/assets/`.

Upload the **contents** of `frontend/dist/` (not the `dist` folder itself) to your chosen S3 frontend prefix. For example:

```text
s3://YOUR-BUCKET/YOUR-FRONTEND-PREFIX/
    index.html
    assets/
        index-[hash].js
        index-[hash].css
```

Do not upload `node_modules`, `src`, or the project package files to the S3 website prefix.

## 2. Deploy the backend to Ubuntu EC2

Copy the `backend` folder to Ubuntu. For example, from your Windows machine, if SSH/SCP is configured:

```powershell
scp -r .\backend ubuntu@YOUR_EC2_PUBLIC_IP:~/taskboard-backend
```

On Ubuntu:

```bash
cd ~/taskboard-backend
npm install
node server.js
```

In a second SSH session, test locally on the EC2 instance:

```bash
curl http://127.0.0.1:3005/api/health
curl http://127.0.0.1:3005/api/tasks
```

Stop the foreground server with `Ctrl+C` after confirming it works.

### Run it with PM2

If PM2 is already installed:

```bash
pm2 start server.js --name taskboard-api
pm2 save
pm2 status
```

If PM2 is not installed, check before installing anything; do not install a second copy if you already have it.

The server binds to `127.0.0.1:3005`, so it is intended to be reached through Nginx on the same EC2 instance, not directly from the public internet.

## 3. Nginx reverse-proxy location

Add this location inside the correct existing `server { ... }` block for the EC2 origin:

```nginx
location ^~ /opsdesk-api/ {
    proxy_pass http://127.0.0.1:3005/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

This maps:

```text
/opsdesk-api/health  -> http://127.0.0.1:3005/api/health
/opsdesk-api/tasks   -> http://127.0.0.1:3005/api/tasks
```

Before reloading Nginx, test its configuration:

```bash
sudo nginx -t
```

Only if the test succeeds:

```bash
sudo systemctl reload nginx
```

Do not replace your whole Nginx configuration. Add the location to the correct existing server block and preserve your other applications.

## 4. CloudFront configuration

Use the same pattern as the working OpsDesk distribution:

### S3 origin
- Origin: your S3 bucket origin.
- Default behaviour (`*`): route to S3.
- Default root object: `index.html`.

### EC2/Nginx origin
- Origin domain: your EC2 public DNS name or other stable origin hostname.
- Origin protocol: HTTP only if your Nginx origin is listening on HTTP (port 80); otherwise configure the matching HTTPS origin.
- Add a behaviour:
  - Path pattern: `/opsdesk-api/*`
  - Origin: EC2/Nginx origin
  - Allowed methods: include GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE for this API lab.
  - Cache policy: caching disabled for API requests.
  - Origin request policy: use the same working policy you configured for OpsDesk.

Do not create a new EC2 instance or additional AWS resources just to use this sample. Reuse the existing deployment infrastructure where appropriate. Check AWS pricing before creating or changing billable resources.

## 5. Verify in this order

### A. Backend on Ubuntu

```bash
curl http://127.0.0.1:3005/api/health
curl http://127.0.0.1:3005/api/dashboard
curl http://127.0.0.1:3005/api/tasks
```

### B. Through Nginx on EC2

```bash
curl http://127.0.0.1/opsdesk-api/health
```

This assumes the Nginx server block is listening on port 80 and the request reaches the intended server block. If your Nginx virtual host requires a Host header, use the hostname configured for that server block.

### C. Through CloudFront

Replace the domain below with your distribution domain:

```text
https://YOUR_CLOUDFRONT_DOMAIN/opsdesk-api/health
https://YOUR_CLOUDFRONT_DOMAIN/opsdesk-api/dashboard
https://YOUR_CLOUDFRONT_DOMAIN/opsdesk-api/tasks
```

Expected health response:

```json
{"status":"ok","service":"taskboard-api"}
```

### D. Browser

Open the CloudFront website. In DevTools → Network → Fetch/XHR, the API calls should use:

```text
https://YOUR_CLOUDFRONT_DOMAIN/opsdesk-api/...
```

They should **not** use `/api/...` in production.

## 6. Updating the frontend safely

Each Vite production build may generate new hashed JS/CSS filenames. Upload the new `index.html` and the complete new `assets/` directory together.

If CloudFront continues to serve an old `index.html` after the S3 upload, compare:
- S3 `index.html`
- `Invoke-WebRequest https://YOUR_CLOUDFRONT_DOMAIN/`
- Browser Network → main document → Response

Only invalidate CloudFront after confirming that its cached object is stale. A wildcard invalidation (`/*`) clears all cached paths in that distribution; it does not delete S3 objects.

## API endpoints

- `GET /api/health`
- `GET /api/dashboard`
- `GET /api/tasks`
- `POST /api/tasks` — body: `{ "title": "Example task", "owner": "Vicky" }`
- `PATCH /api/tasks/:id` — body: `{ "status": "In Progress" }`
- `DELETE /api/tasks/:id`

Task data is stored in `backend/data/tasks.json`. Keep this file when redeploying the backend if you want to preserve the tasks created during the lab.
