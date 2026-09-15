# Solución unificada FFA — inferencia IA end-to-end

> **Fuentes:** `EVALUACION-SISTEMA-VS-ESPECIFICACION.md` · `MEJORAS-EXTRACCION-BALANCE.md`  
> **Fecha:** 2026-09-14  
> **Idea clave:** Dar **más inferencia a Claude** para que resuelva el documento; el código **orquesta y valida**, no decide contabilidad con regex.

---

## 1. Problema en una frase

El cliente pidió: *PDF → líneas → plan de cuentas → cuadratura → revisión por excepción.*

Hoy el pipeline **modifica, purga o inventa** datos (heurísticas, semántica, ajustes sintéticos) antes y después de la IA. Casos como **CMP** (3 páginas) fallan aunque ChatGPT/Claude los resuelven al leer el archivo completo.

---

## 2. Principios (no negociables)

| # | Principio |
|---|-----------|
| 1 | **La IA decide** qué páginas extraer, escala, sección y rubro — con contexto completo del PDF. |
| 2 | **Claude (Anthropic) primero** en extracción, clasificación pre-revisión e informe. |
| 3 | **Sin complemento heurístico** de líneas si hubo extracción Vision exitosa. |
| 4 | **No borrar líneas** en pre-revisión; marcar flags, no `deleteMany`. |
| 5 | **No ajustes sintéticos** de cuadratura sin analista (`crearAjuste: false` por defecto). |
| 6 | **Respetar umbral** post-IA: confianza &lt; umbral → `requiereRevision=true`. |
| 7 | Regex/semántica **solo fallback** offline sin API key. |

---

## 3. Arquitectura en 4 fases

```
PDF → [A] Mapa/alcance (Claude o reglas mínimas PDF corto)
    → [B] Extracción Vision Claude (todas las páginas relevantes)
    → [C] Clasificación Claude (plan filtrado por sección)
    → [D] Validación aritmética + sanity IA opcional
    → Revisión humana (solo excepciones)
```

**Fase A (implementado F1):** PDF ≤ 6 páginas → **todas** a Vision; detección balance partido (activos + pasivos/patrimonio).

**Fase B:** `anthropic-provider.ts` — proveedor default; post-proceso sin `complementarLineasDesdeTextoEscaneado` por defecto.

**Fase C (F2 aplicada):** worker `classify` usa Claude primero (`ia_clasificacion`); semántica solo si IA falla o no hay key.

**Fase D (parcial):** cuadratura determinista; `crearAjusteBalance: false` en validate.

---

## 4. Implementación F1 (aplicada en código)

| # | Cambio | Archivo |
|---|--------|---------|
| 1 | Anthropic default si hay `ANTHROPIC_API_KEY` | `resolve-provider.ts`, `extract-provider.ts`, `sync-extraction-config.ts`, `seed.ts` |
| 2 | Fallback OpenAI solo si Claude falla | `extract-provider.ts` |
| 3 | PDF ≤ 6 pág. → extraer todas (sin smart selection) | `pdf-extract-pages.ts` |
| 4 | Balance partido: «Pasivos y Patrimonio» → `balance` | `pdf-text-scan.ts` |
| 5 | Escala: texto PDF (MUS$/miles) prevalece sobre LLM | `detect-moneda-escala.ts` |
| 6 | Complemento heurístico **off** por defecto | `post-process-extract.ts`, `.env.example` |
| 7 | `requiereRevision` respeta post-proceso + umbral | `extract.ts` |
| 8 | IA pre-revisión respeta umbral confianza | `pre-revision-orchestrator.ts` |

---

## 4b. Implementación F2 (aplicada)

| # | Cambio | Archivo |
|---|--------|---------|
| 1 | `classifyLinesWithIa`: criterio/regla → Claude → semántica | `classify-lines-async.ts` |
| 2 | Worker usa clasificación async con contexto de caso | `apps/worker/src/processors/classify.ts` |
| 3 | Origen `ia_clasificacion` + auditoría `clasificacion_ia_primaria` | `types.ts`, `sugerir-ia.ts`, `linea-contable.ts` |
| 4 | Pre-revisión no re-clasifica líneas ya resueltas por IA primaria | `pre-revision-orchestrator.ts` |
| 5 | Concurrencia y toggle env | `CLASIFICACION_IA_*` en `.env.example` |

## 4c. Implementación F3 (aplicada)

| # | Cambio | Archivo |
|---|--------|---------|
| 1 | Mapa Claude para PDF ≥ 20 pág. (`planPaginasConClaudeMap`) | `pdf-claude-map.ts`, `pdf-extract-pages.ts` |
| 2 | Pre-revisión marca exclusiones — no `deleteMany` | `pre-revision-orchestrator.ts` |
| 3 | `crearAjuste` solo si `=== true` (default off) | `balance-reconciliar.ts` |
| 4 | Reconciliar marca duplicados escala — no borra | `balance-reconciliar.ts` |
| 5 | Diagnóstico cuadratura IA (`?ia=1`, panel revisión) | `diagnostico-cuadratura-ia.ts`, UI |

## 4d. Implementación F4 (aplicada)

| # | Cambio | Archivo |
|---|--------|---------|
| 1 | `provenanceExtraccion` en payload extract | `types.ts`, `pdf-extract-pages.ts`, providers |
| 2 | `ProvenanceCasoDto` en confianza-resumen | `provenance-caso.ts`, `ConfianzaResumenDto` |
| 3 | Banner «Fallback heurístico» | `ProvenanceFallbackBanner.vue`, RevisionView, ConfianzaSemaforoPanel |
| 4 | Métricas: páginas omitidas, filas no extraídas, clasificación heurística | `provenanceDisplay.ts` |
| 5 | Tests golden CMP + Loma Negra | `scripts/test-golden-pages.mjs` |

## 5. Roadmap post-unificación

| Entrega | Notas |
|---------|--------|
| Reprocesar casos golden en UAT | CMP, Molinos con API key |
| Métricas en dashboard admin | Líneas perdidas agregadas por lote |

---

## 6. Criterio de éxito — CMP (FFA-2026-00017)

| Campo | Esperado |
|-------|----------|
| Páginas Vision | 1, 2, 3 |
| Activo 2025 | 4.507.583 MUS$ |
| Pasivo 2025 | 1.816.488 MUS$ |
| Patrimonio 2025 | 2.691.095 MUS$ |
| Escala | miles (×1000) |
| Cuadratura | A = P + PN |
| Líneas ER | excluidas de cuadratura |

---

## 7. Variables de entorno

```env
ANTHROPIC_API_KEY=...
ANTHROPIC_EXTRACT_MODEL=claude-sonnet-4-6
EXTRACTION_PROVIDER=anthropic          # opcional; sync usa Anthropic si hay key
EXTRACT_SHORT_PDF_ALL_PAGES=6          # PDF ≤ N → todas a Vision
EXTRACT_HEURISTIC_COMPLEMENT=0         # no regex post-extract (default)
PDF_SMART_PAGE_SELECTION=1             # en PDFs largos; desactivado en cortos
```

---

## 8. Documentos relacionados

- Auditoría vs spec: `EVALUACION-SISTEMA-VS-ESPECIFICACION.md`
- Casos CMP/Molinos: `MEJORAS-EXTRACCION-BALANCE.md`
- Spec funcional: `ESPECIFICACION-FUNCIONAL-FFA.md`
- Revisión UI: `PROPUESTA-MEJORA-REVISION.md`

---

*Solución unificada — inferencia IA primero, heurística solo fallback.*
