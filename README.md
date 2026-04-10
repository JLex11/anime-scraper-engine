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
- Llama endpoints `POST` con `Authorization: Bearer <token>` o `x-run-once-token`
- `POST /run-once?task=<task>` ejecuta una tarea puntual
- `POST /run-once?batch=<batch>` ejecuta un batch manual seguro para Cloudflare
- `POST /run-once` sin params devuelve el manifiesto de batches disponibles
- En Cloudflare Workers, para pruebas manuales puedes usar:

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
- `sync-anime-images`
- `sync-episode-sources`

Batches disponibles:

- `feed-latest`
- `feed-secondary`
- `directory-refresh`
- `detail-refresh`

### Cómo se evita el límite de Workers

El proyecto no intenta hacer un scraping masivo en una sola invocación. En vez de eso, divide el trabajo en piezas pequeñas y persistentes:

```text
cron / POST manual
    │
    ▼
  scheduler
    │
    ├─► tareas pequeñas por tipo de contenido
    │
    ├─► concurrencia limitada
    │
    ├─► fetch por lotes chicos
    │
    ├─► upserts incrementales en Supabase
    │
    └─► sync_state para reintentos / seguimiento
```

Puntos clave:

- Los cron disparan solo un subconjunto de tareas por invocación.
- `syncLatestAnimes` y `syncLatestEpisodes` toman solo una parte del feed, no todo el sitio.
- `syncLatestAnimes` además calienta solo unos pocos detalles para no gastar presupuesto de subrequests.
- `syncAnimeDetails`, `syncAnimeEpisodes` y `syncEpisodeSources` procesan listas acotadas con control de concurrencia.
- El estado queda guardado en Supabase, así cada corrida puede seguir desde datos ya persistidos.

### Scrapear animes concretos

Endpoint:

- `POST /scrape/anime`

Body JSON:

- `animeId`: string opcional
- `animeIds`: string[] opcional
- `includeDetails`: boolean opcional, default `true`
- `includeEpisodes`: boolean opcional, default `true`

Reglas:

- Debes enviar `animeId` o `animeIds`
- Al menos uno entre `includeDetails` o `includeEpisodes` debe quedar en `true`
- El worker hace seed minimo del anime antes de ejecutar los pipelines

Ejemplo:

```bash
curl -X POST 'https://<worker>/scrape/anime' \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "animeIds": ["one-piece", "bleach-sennen-kessen-hen"],
    "includeDetails": true,
    "includeEpisodes": true
  }'
```

Respuesta:

```json
{
  "ok": true,
  "mode": "scrape-anime",
  "animeIds": ["one-piece", "bleach-sennen-kessen-hen"],
  "includeDetails": true,
  "includeEpisodes": true
}
```

### Scrapear fuentes de episodios concretos

Endpoint:

- `POST /scrape/episode-sources`

Body JSON:

- `episodeId`: string opcional
- `episodeIds`: string[] opcional

Reglas:

- Debes enviar `episodeId` o `episodeIds`
- Cada `episodeId` debe terminar en sufijo numerico, por ejemplo `naruto-12`
- El worker hace seed minimo de anime y episodio antes de refrescar `episode_sources`

Ejemplo:

```bash
curl -X POST 'https://<worker>/scrape/episode-sources' \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "episodeIds": ["one-piece-1000", "bleach-7"]
  }'
```

Respuesta:

```json
{
  "ok": true,
  "mode": "scrape-episode-sources",
  "episodeIds": ["one-piece-1000", "bleach-7"]
}
```

## Imagenes (R2)

El mirror de imagenes a R2 es opcional.

- Si configuras `R2_PUBLIC_BASE_URL` y el binding `R2`, el pipeline de detalles intentara espejar `coverImage` hacia R2 antes de persistir en `animes.images`.
- Si no configuras `R2_PUBLIC_BASE_URL`, el scraper sigue funcionando y guarda la URL original de la imagen.
- En Cloudflare Workers no necesitas `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` ni `R2_SECRET_ACCESS_KEY` si usas el binding nativo del bucket.
- Las columnas `cover_image_key` y `carousel_image_keys` son la fuente canonica interna que este engine mantiene hoy para que la API publica construya `/api/image/:token`.
- La columna `image_key` existe en schema para compatibilidad y migraciones, pero este engine todavia no hace mirror ni persistencia canonica de imagenes de episodios.
- Los campos `images.coverImage`, `images.carouselImages[].link` e `image` pueden seguir guardando URL de origen o `null` por compatibilidad, pero la API no debe depender de ellos como fuente primaria.

### Banners de carrusel (Google CSE + R2)

`sync-anime-images` complementa `animes.images.carouselImages` para uso de UI.

- Usa Google Custom Search API (`GOOGLE_CSE_API_KEY`, `GOOGLE_CSE_CX`) para encontrar candidatas.
- Para banners, la persistencia es **solo** con mirror exitoso en R2 (sin fallback a URL externa).
- Objetivo operativo: al menos 1 banner valido; intenta completar hasta 3 cuando haya disponibilidad.
- Si el anime queda sin banners validos, marca error y aplica backoff de reintentos para evitar arrastrar errores.
- Si hay al menos 1 banner valido, usa refresh normal cada 14 dias.

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
- despliegue por Git integration / Workers Builds en Cloudflare

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
- `SCRAPER_CACHE_BINDING`

Solo si quieres mirror de imagenes publico:

- `R2_PUBLIC_BASE_URL`

Solo si quieres poblar `carouselImages` con Google CSE:

- `GOOGLE_CSE_API_KEY`
- `GOOGLE_CSE_CX`

Opcional para cache persistente de requests:

- un namespace KV enlazado con el binding `SCRAPER_CACHE`

Opcional (normalmente no hace falta tocarla):

- `GOOGLE_CSE_BASE_URL` (default `https://www.googleapis.com/customsearch/v1`)

### 3. Integración Git en Cloudflare

El despliegue queda delegado a Cloudflare Workers Builds conectado al repositorio Git.

Configura en Cloudflare:

- conexión del repo/branch en `Workers & Pages`
- variables y secrets runtime del Worker (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SCRAPER_MANUAL_RUN_TOKEN`, `R2_PUBLIC_BASE_URL`, `GOOGLE_CSE_API_KEY`, `GOOGLE_CSE_CX`, etc.)

No hace falta configurar secrets de despliegue en GitHub Actions si el deploy lo hace Cloudflare directamente.

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
20 */6 * * *     -> sync-details-and-episodes, sync-anime-images
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

Manifiesto local de batches:

```bash
curl -X POST 'http://127.0.0.1:8787/run-once' \
  -H 'Authorization: Bearer <token>'
```

Ejemplos locales de endpoints manuales:

```bash
curl -X POST 'http://127.0.0.1:8787/scrape/anime' \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{"animeId":"one-piece"}'
```

```bash
curl -X POST 'http://127.0.0.1:8787/scrape/episode-sources' \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{"episodeId":"one-piece-1000"}'
```
