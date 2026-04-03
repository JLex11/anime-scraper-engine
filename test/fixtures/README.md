# Fixtures

Estos archivos son snapshots HTML versionados para tests de regresion del scraping.

Uso esperado:

- reemplazar estos fixtures por capturas reales del sitio cuando se quieran endurecer los tests
- mantener nombres estables por tipo de pagina
- agregar un fixture nuevo cuando cambie el markup y el parser deba adaptarse

Convencion inicial:

- `animeflv/home.latest.html`: homepage con episodios recientes y listados
- `animeflv/anime.mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru.html`: pagina real de detalle de anime
- `animeflv/episode.mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru-1.html`: pagina real `/ver/...` con `videos`
