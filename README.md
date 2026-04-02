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

## Imagenes (R2)

Si configuras `R2_*` + `R2_PUBLIC_BASE_URL`, el pipeline de detalles intentara espejar `coverImage` hacia R2 antes de persistir en `animes.images`.
