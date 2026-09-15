# Mejoras de extracción y balance — casos CMP y Molinos

> **Casos de referencia:** FFA-2026-00017 (CMP · 3 páginas) · FFA-2026-00009 (Molinos · 177 páginas)  
> **Fecha:** 2026-09-14  
> **Solución unificada implementada:** [`SOLUCION-UNIFICADA-IA.md`](./SOLUCION-UNIFICADA-IA.md)  
> **Principio rector:** **Dar más inferencia a la IA para que resuelva todo.** El pipeline hoy decide demasiado antes de llamar al modelo (regex, scores, semántica, recortes de páginas). La solución no es más reglas: es **más contexto + más llamadas Claude** con mandato explícito de cerrar el caso (páginas, líneas, escala, rubros, cuadratura).

---

## 1. Resumen ejecutivo

### La clave de la solución

**ChatGPT leyó el PDF entero y devolvió Activo / Pasivo / Patrimonio en segundos.** FINYX falló porque interpuso capas que **deciden por la IA** antes de dejarla razonar:

```
Hoy:     PDF → regex elige páginas → visión solo p1 → regex rellena p3 → semántica clasifica → IA parcial
Objetivo: PDF → IA entiende documento → IA extrae todo lo relevante → IA clasifica → IA valida cuadratura
```

**Más inferencia** significa concretamente:

| Hoy (poco contexto IA) | Objetivo (IA resuelve) |
|------------------------|-------------------------|
| 1 página a visión de 3 | IA ve **todas** las páginas o mapa completo |
| Prompt de extracción sin mapa del balance partido | IA sabe que p2 es continuación de p1 |
| Clasificación semántica sin `seccionPagina` | IA recibe sección + plan + líneas ya extraídas |
| Escala: regex pelea con LLM | **Una** respuesta IA con encabezado MUS$ |
| Cuadratura: suma ciega sin pasivo | IA detecta «falta mitad del balance» |

Dos PDFs “fáciles” fallaron porque el código **recortó el problema** antes de la inferencia. CMP perdió p2; Molinos mandó a la IA páginas vacías de auditor.

| Caso | Síntoma | Causa raíz | Enfoque de solución |
|------|---------|------------|---------------------|
| **CMP** | Pasivo/Patrimonio = 0 | p2 nunca enviada a visión; p3 entró por heurística | Claude extrae **todas** las páginas del PDF corto |
| **Molinos** | Aborto sin líneas | Scan regex eligió páginas falsas | Claude hace **mapa del documento** antes de extraer |

**Objetivo CMP (MUS$ 2025):**

| Concepto | Valor correcto |
|----------|----------------|
| Activo total | 4.507.583 |
| Pasivo total | 1.816.488 |
| Patrimonio neto | 2.691.095 |

---

## 2. Estado actual del pipeline — qué usar menos

### 2.1 Capas que fallaron en CMP

| Capa | Tecnología actual | Qué hizo mal en CMP |
|------|-------------------|---------------------|
| Selección de páginas | `pdf-text-scan.ts` (regex + score) | p2 → `otro`; solo `[1]` a visión |
| Extracción p1 | Visión LLM (OpenAI primero) | **Bien** — TOTAL ACTIVOS correcto |
| Extracción p2 | **No ejecutada** | Sin pasivo ni patrimonio |
| Extracción p3 | `complementarLineasDesdeTextoEscaneado` (regex filas) | 13 líneas ER; 3 mal clasificadas |
| Escala | LLM + regex `detect-moneda-escala` | LLM dijo millones; PDF dice miles |
| Clasificación | Reglas → **semántica** (`similitudTexto`) → IA opcional | 3 líneas ER → rubros balance (conf. 28%) |

### 2.2 Por qué semántica y heurística no alcanzan

- **Semántica** (`classify-lines.ts`): compara strings normalizados y aliases. No entiende que «Ganancia de actividades operacionales» es ER, no activo. Por eso cae en rubro 1.9 genérico.
- **Heurística de tablas** (`extraer-lineas-tabla-texto.ts`): regex sobre texto plano del PDF. No ve layout, no distingue balance partido, no infiere MUS$ del encabezado visual.
- **Scan de páginas** (`pdf-text-scan.ts`): frágil ante títulos IFRS («Consolidado - Pasivos y Patrimonio», «Estado consolidado de…»).

**Lección:** Lo que funcionó en CMP fue **inferencia IA con imagen + prompt** en p1 (conf. 0.95). Lo que rompió todo fue **negarle inferencia** al resto del documento (p2 omitida, p3 resuelta con regex, clasificación sin contexto de sección).

### 2.3 Regla de diseño — «¿Quién decide?»

Antes de agregar código, preguntar:

| Decisión | ¿Quién debería decidir? | Hoy decide |
|----------|-------------------------|------------|
| ¿Qué páginas extraer? | **IA** (con texto o imagen del PDF) | Regex `pdf-text-scan` |
| ¿Es balance partido? | **IA** | Regex de títulos |
| ¿MUS$ o millones? | **IA** (lee encabezado) | Regex + LLM en conflicto |
| ¿Qué rubro del plan? | **IA** (con plan en prompt) | Semántica + fallback 1.9 |
| ¿Cierra A = P + PN? | **IA** + aritmética | Solo suma (sin detectar omisión) |
| ¿Línea es ER o balance? | **IA** (en extracción) | Regex post-hoc |

**Meta:** el pipeline **prepara contexto y valida JSON**; la **inferencia** la hace Claude.

---

## 3. Arquitectura objetivo — inferencia IA end-to-end

```
                    ┌─────────────────────────────────────┐
                    │  PDF completo (o páginas clave)      │
                    └─────────────────┬───────────────────┘
                                      │
          ┌───────────────────────────▼───────────────────────────┐
          │  FASE A — INFERENCIA: entender el documento completo      │
          │  Input rico: texto de todas las pág. (+ miniaturas si hace)│
          │  Output: mapa JSON — la IA decide qué extraer y cómo       │
          │  • balance partido, MUS$, ejercicio, totales esperados     │
          │  • sin score regex ni cap de páginas en PDFs cortos        │
          └───────────────────────────┬───────────────────────────┘
                                      │
          ┌───────────────────────────▼───────────────────────────┐
          │  FASE B — INFERENCIA: extraer tablas (Vision)            │
          │  Prompt incluye mapa Fase A + totales a verificar        │
          │  • «Extrae pasivo y patrimonio; debe cuadrar con activo» │
          │  • seccionPagina, estadoFinancieroLinea en cada línea    │
          │  • cero complemento regex — si falta algo, re-prompt IA  │
          └───────────────────────────┬───────────────────────────┘
                                      │
          ┌───────────────────────────▼───────────────────────────┐
          │  FASE C — INFERENCIA: clasificar al plan de cuentas    │
          │  Input: líneas + plan completo + mapa + sección        │
          │  • IA elige rubro o declara sin_rubro — no imputar 1.9 │
          │  • semántica/el aliases solo si API caída                │
          └───────────────────────────┬───────────────────────────┘
                                      │
          ┌───────────────────────────▼───────────────────────────┐
          │  FASE D — INFERENCIA: cerrar o reabrir extracción     │
          │  • IA compara totales extraídos vs mapa Fase A         │
          │  • si falta pasivo/patrimonio → re-extraer pág. X      │
          │  • aritmética local solo confirma, no reemplaza juicio │
          └───────────────────────────────────────────────────────┘
```

### 3.1 Qué es «más inferencia» en la práctica

No es un solo prompt más largo: es **dejar de resolver en código lo que el modelo ya resuelve bien** si le damos el input completo.

**Contexto mínimo que la IA debe recibir en cada fase:**

| Fase | Contexto a inyectar |
|------|---------------------|
| A — Mapa | Texto de todas las páginas; total páginas; nombre archivo; objetivo: «identificar estados financieros y totales 2025» |
| B — Extracción | Mapa A; imagen de la página; instrucción de cuadratura; unidad MUS$/millones del mapa |
| C — Clasificación | Líneas con `seccionPagina`; plan de cuentas (codigo, nombre, estadoFinanciero); reglas: «ER nunca a rubro activo» |
| D — Cierre | Totales por cara; mapa A; pregunta: «¿balance completo? ¿reprocesar página?» |

**Re-prompt en lugar de heurística:** si Fase B devuelve activo sin pasivo, **volver a llamar IA** con «falta pasivos y patrimonio — página 2 del mapa» en vez de regex en p2.

### 3.2 Configuración recomendada

| Variable / config | Valor objetivo |
|-------------------|----------------|
| `extractionProvider` | **`anthropic`** (no OpenAI primero) |
| `ANTHROPIC_EXTRACT_MODEL` | `claude-sonnet-4-6` o superior |
| PDF ≤ 6 páginas | **Todas** a Claude Vision (sin smart selection regex) |
| `complementarLineasDesdeTextoEscaneado` | **Desactivado** si extracción fue Anthropic OK |
| Clasificación worker | **Claude obligatorio** pre-revisión; semántica solo sin API key |
| Fallback | Heurística **solo** si Anthropic falla tras N reintentos |

### 3.3 Qué conservar sin IA (solo validación, no decisión)

| Componente | Rol |
|------------|-----|
| Reglas de clasificación (`patron_denominacion`) | Match exacto 95% — antes de llamar Claude |
| Criterios contribuyente | Match histórico 98% |
| Filtros cuadratura (`balance-filters`) | Post-proceso determinista |
| Dedupe / normalización montos | Post-proceso determinista |

---

## 4. Mejoras priorizadas (enfoque Claude)

### P0 — Bloqueantes

#### P0.1 Anthropic como proveedor principal de extracción

**Problema:** Hoy `extractOpenAiWithAnthropicFallback` — OpenAI primero; CMP usó visión pero el fallback oculta inconsistencias entre proveedores.

**Solución Claude:**

- Default `resolveExtractionProvider()` → **`anthropic`** si `ANTHROPIC_API_KEY` presente.
- Misma prompt y schema JSON para todas las páginas.
- Registrar `metodoExtraccion: "claude_vision"` (no mezclar con heurística en la misma corrida).

**Archivos:** `extract-provider.ts`, `resolve-provider.ts`, `config` sistema, worker `extract.ts`

**Aceptación CMP:** 100% líneas balance con `metodoExtraccion` = visión Claude, no `heuristica`.

---

#### P0.2 PDFs cortos — Claude Vision en todas las páginas (sin regex selector)

**Problema:** Smart selection con `pdf-text-scan` dejó CMP en `[1]`.

**Solución Claude:**

- Si `totalPages ≤ 6`: **renderizar y enviar todas** a Claude Vision en secuencia.
- Opcional Fase A ligera: un solo call Claude con texto de las N páginas (ya disponible vía pdf.js) pidiendo JSON:
  ```json
  {
    "paginas": [
      { "num": 1, "tipo": "balance_activos", "extraer": true },
      { "num": 2, "tipo": "balance_pasivos_patrimonio", "extraer": true },
      { "num": 3, "tipo": "resultados", "extraer": true }
    ],
    "moneda": "USD",
    "escala": "miles",
    "escalaDescripcion": "MUS$"
  }
  ```
- **No depender** de `score >= 28` ni de `tituloCanonico` regex para PDFs cortos.

**Archivos:** `pdf-extract-pages.ts`, nuevo `claude-document-map.ts`, `anthropic-provider.ts`

**Aceptación CMP:** p1, p2 y p3 procesadas; p2 con TOTAL PASIVOS y Patrimonio total.

---

#### P0.3 Metadatos moneda/escala — Claude en Fase A, no regex vs LLM

**Problema:** Regex detectó miles pero LLM OpenAI dijo millones; prevaleció factor 1e6.

**Solución Claude:**

- En Fase A (mapa), Claude lee encabezado: **«MUS$ — Miles de dólares estadounidenses»**.
- Prompt explícito: *«Si dice MUS$ o miles of US dollars, escala = miles, factor 1000»*.
- Post-validación determinista: si Claude devuelve totales coherentes con suma × factor, fijar escala.
- **Eliminar** conflicto `metadata.escala` LLM vs regex — **una sola fuente: respuesta Claude Fase A**.

**Archivos:** `detect-moneda-escala.ts` (solo validación/fallback), prompts, Fase A mapa

**Aceptación CMP:** `escalaFactor: 1000`, coherente con MUS$.

---

#### P0.4 Balance partido — Claude identifica continuación (no regex titulo)

**Problema:** p2 «Pasivos y Patrimonio» no matchea patrones de `pdf-text-scan`.

**Solución Claude:**

- Fase A: *«¿Hay balance en más de una página? Indicar parejas activos / pasivos+patrimonio»*.
- Marcar p(N+1) como obligatoria si Claude dice `continuacion_balance: true`.
- Regex (`Pasivos y Patrimonio`, `Patrimonio y pasivos`) solo como **fallback** si Fase A falla.

**Aceptación CMP:** mapa incluye p1+p2 como un solo estado financiero.

---

#### P0.5 Molinos — mapa Claude antes de extraer (reemplazar 29 regex “canónicas”)

**Problema:** 177 páginas; regex marcó notas de auditor como balance.

**Solución Claude:**

- Fase A con **índice/texto de todas las páginas** (pdf.js, sin PNG): Claude devuelve lista de páginas con estados reales (p23, p24, p26…).
- Máximo 16–24 páginas a Vision — elegidas por **Claude**, no por `score + tituloCanonico`.
- Regex `pdf-text-scan` pasa a **hint** opcional en el prompt, no decisor.

**Aceptación Molinos:** plan incluye p24 balance con cifras; no abortar en página vacía si Claude indicó páginas fuertes pendientes.

---

### P1 — Cuadratura y clasificación con Claude

#### P1.1 Eliminar complemento heurístico cuando Claude extrajo la página

**Problema:** `complementarLineasDesdeTextoEscaneado` añadió líneas p3 duplicadas/mezcladas.

**Solución:**

- Flag `EXTRACT_HEURISTIC_COMPLEMENT=0` por defecto si proveedor = anthropic.
- Heurística solo si: página en mapa Claude **y** Vision devolvió 0 líneas **y** reintento falló.
- Nunca mezclar `heuristica` + `claude_vision` en la misma página sin dedupe estricto.

**Archivos:** `post-process-extract.ts`, `extraer-lineas-tabla-texto.ts`

---

#### P1.2 Clasificación — Claude batch, no semántica

**Problema:** `matchSemantico` asignó ER a rubros 1.9 / 2.1.x. La IA pre-revisión ya usa Anthropic (`sugerir-ia.ts`) pero **después** de semántica y con candidatos contaminados.

**Solución Claude:**

1. **Orden nuevo:** criterio contribuyente → reglas (95%+) → **Claude clasificación** → semántica **solo fallback**.
2. Prompt Claude con:
   - `seccionPagina` de la extracción (balance vs resultados)
   - Rubros **filtrados** por `estadoFinanciero` según sección
   - Instrucción: *«Si seccionPagina=resultados, NUNCA asignar rubro activo/pasivo»*
3. Lote por caso en worker `classify` (ya existe `clasificacion-ia.ts` — **hacerlo obligatorio**, no opt-in).
4. Confianza < 70 → `sin_rubro`, no rubro genérico 1.9.

**Archivos:** `classify-lines.ts`, `clasificacion-ia.ts`, `sugerir-ia.ts`, worker `classify.ts`

**Aceptación CMP:** cero líneas p3 en cuadratura; rubros 4.x o sin rubro.

---

#### P1.3 Cuadratura — Claude sanity check post-clasificación

**Problema:** Sistema llegó a revisión con Activo sin Pasivo/Patrimonio.

**Solución Claude (1 call barato, texto):**

```
Tienes estos totales extraídos: Activo X, Pasivo Y, Patrimonio Z.
¿Cierra A = P + PN? ¿Falta alguna cara del balance?
PDF tenía páginas: [mapa Fase A]
```

- Si Claude responde «falta pasivo/patrimonio» → `balanceIncompleto: true`, no pasar a revisión verde.
- Regex cuadratura sigue siendo la fuente de verdad numérica; Claude es **detector de omisiones**.

**Archivos:** nuevo `claude-cuadratura-check.ts`, `revision.ts` / validate worker

---

#### P1.4 Aislar resultados de cuadratura (determinista, refuerzo)

Independiente de Claude, pero necesario:

- Excluir cuadratura si `seccionPagina === 'resultados'` **aunque** el rubro sea 1.x/2.x.
- Refuerzo cuando clasificación Claude falló.

**Archivos:** `balance-filters.ts`, `lineaCuadratura.ts`

---

### P2 — Plan de cuentas (soporte a Claude, no reemplazo)

Claude clasifica mejor con plan claro:

| Mejora | Para qué ayuda a Claude |
|--------|-------------------------|
| Rubros ER granulares (4.x operativo, financiero, impuestos) | Menos «no hay rubro» → menos fallback 1.9 |
| Rubro subtotal no asignable | Claude puede marcar `excluirCuadratura: true` en JSON |
| Aliases patrimonio IFRS | Capital emitido, ganancias acumuladas, reservas, PNCI |
| Export plan compacto en prompt | Lista codigo \| nombre \| estadoFinanciero \| aliases |

**Formato sugerido en prompt Claude clasificación:**

```
RUBROS BALANCE (solo si seccionPagina=balance):
1.2.01 | Efectivo | activo
2.1.03 | Pasivos imp. diferidos | pasivo
...

RUBROS RESULTADOS (solo si seccionPagina=resultados):
4.1 | Ingresos | resultados
...
```

---

### P3 — Métricas, UX y costos

#### P3.1 Métricas honestas

- Cobertura = % páginas que Claude marcó `extraer: true` y devolvieron líneas.
- Penalizar confianza si Fase D detecta balance incompleto.
- Mostrar `origenClasificacion: claude` vs `semantica` en revisión.

#### P3.2 UX revisión

- Banner: «Extracción Claude» vs «Fallback heurístico — revisar con cuidado».
- Totales esperados del mapa Claude vs totales calculados.
- Link a página omitida si sanity check falla.

#### P3.3 Costo / latencia

| Escenario | Calls Claude estimados |
|-----------|------------------------|
| CMP (3 pág.) | 1 mapa + 3 visión + 1 clasificación lote + 1 cuadratura ≈ **6** |
| Molinos (177 pág.) | 1 mapa texto + 16 visión + clasificación lote ≈ **18** |

PDFs ≤6 páginas: costo bajo, **máxima calidad** — priorizar siempre Claude completo.

---

## 5. Matriz de cambios — Claude vs heurística

| Área | Hoy (reducir) | Objetivo (Claude) |
|------|---------------|-------------------|
| Selección páginas | `pdf-text-scan` + score | **Fase A mapa Claude** |
| PDF ≤6 pág. | Smart selection | **Todas a Vision** |
| Extracción líneas | OpenAI + complemento regex | **Anthropic Vision por página** |
| Metadatos escala | Regex vs LLM conflict | **Claude Fase A** |
| Clasificación | Reglas → **semántica** → IA opcional | Reglas → **Claude obligatorio** → semántica fallback |
| Cuadratura omisiones | Solo suma numérica | **Claude sanity check** + suma |
| Molinos page pick | 29 regex canónicas | **Claude índice 177 pág.** |

---

## 6. Plan de pruebas

### CMP — criterio de oro

```
Proveedor: anthropic
Páginas Claude Vision: 1, 2, 3
Sin líneas metodoExtraccion=heuristica (salvo fallback explícito)

Totales 2025 MUS$:
  Activo     4.507.583
  Pasivo     1.816.488
  Patrimonio 2.691.095

Clasificación: origenClasificacion != semantica en >90% líneas
Cuadratura: OK
Escala: miles (factor 1000)
```

### Molinos

```
Fase A Claude: incluye p23, p24, p26
Extracción: líneas > 0, no aborto p28 vacía
```

### Regresión Loma Negra

Mapa Claude + extracción; mantener tests existentes.

---

## 7. Orden de implementación

| Sprint | Entregable | Enfoque |
|--------|------------|---------|
| **1** | P0.1 + P0.2 + P0.3 | Anthropic default; PDF corto = todas las páginas; escala en Fase A |
| **2** | P0.4 + P1.1 | Balance partido vía mapa Claude; apagar complemento heurístico |
| **3** | P1.2 + P1.4 | Clasificación Claude obligatoria; cuadratura aislada de ER |
| **4** | P0.5 + P1.3 | Molinos mapa Claude; sanity check cuadratura |
| **5** | P2 + P3 | Plan cuentas para prompts; UX origen claude vs fallback |

---

## 8. Referencia CMP — ChatGPT vs FINYX

| Concepto | Correcto (MUS$) | FINYX hoy | FINYX objetivo (Claude) |
|----------|-----------------|-----------|-------------------------|
| Activo | 4.507.583 | 4.507.583 ✓ (solo p1 visión) | 4.507.583 ✓ |
| Pasivo | 1.816.488 | ausente | 1.816.488 ✓ (p2 visión) |
| Patrimonio | 2.691.095 | ausente | 2.691.095 ✓ (p2 visión) |
| Motor extracción | — | OpenAI p1 + heurística p3 | **Claude p1+p2+p3** |
| Motor clasificación | — | Semántica + IA parcial | **Claude batch** |
| Cuadratura | Cierra | Falla | Cierra |

---

## 9. Anti-patrones a evitar

1. **Resolver en código** lo que la IA puede inferir con contexto completo (selección de páginas, balance partido, escala).
2. **Recortar input** a la IA (1 de 3 páginas, plan sin rubros ER, sin mapa previo).
3. **Semántica como clasificador principal** — es matching de strings, no razonamiento contable.
4. **Complemento regex** después de visión — mezcla fuentes y contamina cuadratura.
5. **Fallback silencioso** a rubro 1.9 — mejor `sin_rubro` y re-inferencia IA.
6. **Semáforo verde** cuando la IA nunca vio la mitad del balance.

### 9.1 Mantra de implementación

> **Si el humano con ChatGPT lo resuelve leyendo el PDF, la IA del pipeline debe recibir equivalente a «leer el PDF» — no un fragmento filtrado por regex.**

---

## 10. Documentos relacionados

- `docs/PROPUESTA-MEJORA-REVISION.md` — UI revisión (mostrar origen Claude vs fallback).
- `packages/pipeline/src/extract/anthropic-provider.ts` — base Vision existente.
- `packages/pipeline/src/classify/sugerir-ia.ts` — base clasificación Claude existente.
- `apps/api/src/services/clasificacion-ia.ts` — extender a flujo obligatorio pre-revisión.

---

*Enfoque revisado: la clave es **más inferencia IA** (contexto completo + Claude end-to-end), no más heurística — septiembre 2026.*
