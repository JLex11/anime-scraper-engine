# anime-scraper-engine

Motor de scraping separado de la API publica. Ejecuta pipelines de ingesta y escribe en Supabase con `service_role`.

## Objetivo

- Extraer datos con Bun + HTMLRewriter.
- Persistir feeds, animes, episodios y fuentes en Supabase.
- Mantener idempotencia por `upsert`.

## Estructura

- `src/extractors`: parsing HTML/script (`HTMLRewriter` + regex)
- `src/pipelines`: sync jobs
- `src/writers`: persistencia a Supabase
- `src/scheduler`: orquestacion de tareas

## Ejecutar

```bash
bun install
bun run dev
```

Ejecucion unica:

```bash
bun run sync:once
```

Trigger manual del Worker:

- Configura `SCRAPER_MANUAL_RUN_TOKEN`
- Llama `POST /run-once` con `Authorization: Bearer <token>` o `x-run-once-token`

## Imagenes (R2)

Si configuras `R2_*` + `R2_PUBLIC_BASE_URL`, el pipeline de detalles intentara espejar `coverImage` hacia R2 antes de persistir en `animes.images`.

## Deploy en Cloudflare Workers (Cron)

Este repo ya incluye:

- `wrangler.toml` con `scheduled` crons
- entrypoint Worker en `src/worker.ts`
- workflow CI/CD en `.github/workflows/deploy-worker.yml`

### 1. Requisitos en Cloudflare

- Cuenta Cloudflare con Workers habilitado.
- Un bucket R2 llamado `anime-app` (o cambia `wrangler.toml`).
- API Token de Cloudflare con permisos de Workers Scripts y Workers KV/Queues/R2 segun tu uso.

### 2. Secrets de GitHub necesarios

Configura estos secrets en el repo:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SCRAPER_MANUAL_RUN_TOKEN`
- `R2_PUBLIC_BASE_URL`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

### 3. Flujo CI/CD

Cada push a `master` o `main`:

1. instala dependencias
2. ejecuta typecheck
3. despliega con `wrangler deploy`

### 4. Prueba local del Worker

```bash
bun install
bun run dev:worker
```

Healthcheck:

```bash
curl http://127.0.0.1:8787/health
```
