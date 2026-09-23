# Render Staging Deployment

This repository includes a `render.yaml` blueprint for a temporary staging deployment of Industrial Brain.

## Scope

The Render blueprint runs the Node/Express application as a single web service. It is suitable for product demonstrations and API/UI validation only. It is not a production industrial deployment because the current application store is local JSON and is not durable across instance replacement or deploys.

## Required settings

Render generates `JWT_SECRET` and `AUDIT_HMAC_KEY` automatically. `GEMINI_API_KEY` is optional; without it, the application uses its deterministic fallback responses. `DEMO_MODE` and `VITE_DEMO_MODE` are enabled only in the staging blueprint so that seeded demo personas and automatic demo login are never enabled by default in normal deployments.

## Health checks

Use `/healthz` for the Render health check. The API health endpoint is `/api/v1/health` and is intentionally available before protected API routers so platform health probes can reach it.

## Important limitations before public launch

The staging service must not receive confidential industrial data. Before production use, replace the JSON store with PostgreSQL, add a durable migration and backup process, configure a managed Redis service if queues are required, remove demo mode, configure a real email/invite flow, and complete an external security review. The Excel connector also depends on `xlsx`, which currently has an unresolved high-severity advisory; file ingestion should remain restricted until that dependency is replaced or isolated.
