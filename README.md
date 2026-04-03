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

Validacion local:

```bash
bun test
bunx tsc --noEmit
```

Trigger manual del Worker:

- Configura `SCRAPER_MANUAL_RUN_TOKEN`
- Llama `POST /run-once` con `Authorization: Bearer <token>` o `x-run-once-token`
- En Cloudflare Workers, para pruebas manuales usa tareas puntuales:

```bash
curl -X POST 'https://<worker>/run-once?task=sync-latest-animes' \
  -H 'Authorization: Bearer <token>'
```

Tareas disponibles:

- `sync-latest-animes`
- `sync-latest-episodes`
- `sync-broadcast`
- `sync-top-rated`
- `sync-directory`
- `sync-details-and-episodes`
- `sync-episode-sources`

Nota: ejecutar `/run-once` sin `task` intenta correr todo el scheduler en una sola invocacion; en Cloudflare puede pegar el limite de subrequests.

## Imagenes (R2)

El mirror de imagenes a R2 es opcional.

- Si configuras `R2_PUBLIC_BASE_URL` y el binding `R2`, el pipeline de detalles intentara espejar `coverImage` hacia R2 antes de persistir en `animes.images`.
- Si no configuras `R2_PUBLIC_BASE_URL`, el scraper sigue funcionando y guarda la URL original de la imagen.
- En Cloudflare Workers no necesitas `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` ni `R2_SECRET_ACCESS_KEY` si usas el binding nativo del bucket.

## Enriquecimiento Jikan

`syncAnimeDetails` mantiene AnimeFLV como fuente base y complementa metadata desde Jikan/MyAnimeList en `anime_jikan_details`.

- Usa `JIKAN_BASE_URL` si quieres apuntar a otra instancia; por defecto usa `https://api.jikan.moe/v4`.
- Solo refresca enrichment vencido o inexistente; el TTL actual es de 7 dias.
- La migracion SQL incluida crea la tabla `anime_jikan_details` para poster MAL, synopsis, trailer, promos y metadata adicional.
- El matching usa el titulo principal y tambien los titulos alternativos (`TxtAlt`) extraidos desde AnimeFLV.

## Deploy en Cloudflare Workers (Cron)

Este repo ya incluye:

- `wrangler.toml` con `scheduled` crons
- entrypoint Worker en `src/worker.ts`
- workflow CI/CD en `.github/workflows/deploy-worker.yml`

### 1. Requisitos en Cloudflare

- Cuenta Cloudflare con Workers habilitado.
- Un bucket R2 llamado `anime-app` solo si quieres mirror de imagenes.
- API Token de Cloudflare con permisos de Workers Scripts y Workers KV/Queues/R2 segun tu uso.

### 2. Variables del Worker

Minimas para que el scraper funcione:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SCRAPER_MANUAL_RUN_TOKEN`

Vars no sensibles ya definidas en `wrangler.toml`:

- `ANIMEFLV_BASE_URL`
- `JIKAN_BASE_URL`
- `SCRAPER_MAX_CONCURRENCY`
- `SCRAPER_REQUEST_TIMEOUT_MS`
- `SCRAPER_REQUEST_RETRY_ATTEMPTS`
- `SCRAPER_LOG_LEVEL`
- `R2_BUCKET`
- `R2_BUCKET_BINDING`

Solo si quieres mirror de imagenes publico:

- `R2_PUBLIC_BASE_URL`

### 3. Secrets de GitHub necesarios para CI/CD

Configura estos secrets en el repo:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SCRAPER_MANUAL_RUN_TOKEN`

Opcionales si expones imagenes desde R2:

- `R2_PUBLIC_BASE_URL`

### 4. Flujo CI/CD

Cada push a `master` o `main`:

1. instala dependencias
2. ejecuta typecheck
3. despliega con `wrangler deploy`

### 5. Cron configurados

```bash
*/15 * * * *     -> sync-latest-animes, sync-latest-episodes
*/30 * * * *     -> sync-broadcast, sync-top-rated, sync-episode-sources
5 0 * * *        -> sync-directory
20 0 * * *       -> sync-details-and-episodes
```

Los cron del Worker corren en UTC.

### 6. Prueba local del Worker

```bash
bun install
bun run dev:worker
```

Healthcheck:

```bash
curl http://127.0.0.1:8787/health
```

Smoke test manual:

```bash
curl -X POST 'http://127.0.0.1:8787/run-once?task=sync-latest-animes' \
  -H 'Authorization: Bearer <token>'
```
