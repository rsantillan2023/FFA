# Propuesta de mejora — Pantalla `/revision`

> **Caso de referencia:** FFA-2026-00014 · Loma Negra 2025  
> **Fecha:** 2026-03-13  
> **Objetivo:** Simplificar la revisión humana, mostrar claramente lo extraído por IA y su vínculo con el plan de cuentas, y permitir cerrar el expediente con el mínimo trabajo manual posible.

---

## 1. Diagnóstico del estado actual

### 1.1 Lo que funciona bien

| Capacidad | Dónde está |
|-----------|------------|
| Franja de metadatos del expediente (empresa, RUT, ejercicio, moneda, escala, documento) | `RevisionView.vue` — `revision-meta-strip` |
| Formulario de identificación con confirmación explícita | Sección `#revision-identificacion` |
| Grilla de líneas con rubro, monto, confianza, página PDF | `RevisionSplitView` + `RevisionLineList` |
| Cuadratura en vivo (Activo = Pasivo + Patrimonio) con preview al editar | `balanceTotales.ts` + sección cuadratura |
| IA por línea y masiva para líneas dudosas | Botones en header de líneas + acciones por fila |
| Modal de validaciones (Evaluar) con reconocer/descartar | Modal `evaluarModalOpen` |
| Aprobación de ficha → generación de informe | Footer + `aprobar-ficha` |

### 1.2 Por qué “vuelve loco” al usuario

La pantalla concentra **demasiadas decisiones simultáneas** en una sola página larga (~3.500 líneas en un solo componente). El analista ve:

```
Header:     Ver documento | Texto IA | Reprocesar | Reiniciar foja cero
Meta strip: 8 campos + botón Confirmar/Completar
Identificación: 5 campos + Confirmar | Re-leer IA | Reclasificar | Historial | ℹ guía
Líneas:     Clasificar dudosas IA | Agregar línea | [grilla con ✓ 💾 🪄 📄 por fila]
Cuadratura: panel 1=2+3
Footer:     3 chips estado | checkbox “Aprobar pendientes…” | Evaluar | Revisar y aprobar ficha
```

**Problemas concretos:**

1. **Demasiados botones de “aprobación” con significados distintos**
   - Confirmar identificación (metadatos)
   - ✓ Aprobar línea (individual)
   - 💾 Guardar línea (que además aprueba automáticamente)
   - Reconocer validación en Evaluar
   - Checkbox “Aprobar pendientes y continuar” (atajo masivo)
   - “Revisar y aprobar ficha” (cierre formal)

   El propio código incluye un modal **“¿Qué botón usar?”** — señal de que la UX ya reconoce confusión.

2. **No hay flujo guiado por fases**
   - Existe `RevisionStepNav.vue` (wizard por pasos) pero **no se usa**.
   - Todo es scroll + footer fijo; el usuario no sabe qué hacer primero.

3. **La extracción IA no está integrada al flujo principal**
   - “Texto extraído por IA” vive en un modal del header, desconectado de las líneas y la cuadratura.
   - No se ve de un vistazo qué vino de IA vs. qué confirmó el analista.

4. **Cuadratura y líneas están separadas visualmente**
   - La cuadratura está *debajo* de cientos de líneas; hay que scrollear mucho para correlacionar diferencia ↔ línea problemática.

5. **No existe “cerrar sin cuadrar”**
   - Hoy solo se puede forzar con el checkbox “Aprobar pendientes…” + reconocer cuadratura en Evaluar.
   - No hay un gesto explícito tipo *“Hasta acá llegué — generar informe con lo que tengo”* con trazabilidad.

6. **Sobre-fetching**
   - Cada guardado/aprobación de línea recarga caso + líneas + blockers completos → sensación de lentitud en balances grandes.

---

## 2. Principios de diseño propuestos

| # | Principio | Implicación |
|---|-----------|-------------|
| P1 | **Dos fases, no diez botones** | Fase A: datos referenciales. Fase B: líneas + cuadratura. |
| P2 | **IA trabaja primero, humano solo duda** | Auto-aplicar clasificaciones de alta confianza; cola de excepciones. |
| P3 | **Un cierre, dos modos** | “Ficha completa” vs. “Ficha parcial / con observaciones”. |
| P4 | **Ver origen siempre** | Cada dato muestra si es IA, corregido, o manual. |
| P5 | **Cuadratura accionable** | Desde la diferencia, saltar a las líneas que más impactan. |

---

## 3. Propuesta de flujo simplificado

### Fase A — Identificación referencial *(obligatoria)*

**Qué debe ver el usuario en un solo bloque compacto:**

```
┌─────────────────────────────────────────────────────────────────┐
│ EXPEDIENTE · FFA-2026-00014 · Loma Negra 2025                   │
│ Documento: loma-negra-4q25-esp.pdf          [Ver PDF] [Texto IA]│
├─────────────────────────────────────────────────────────────────┤
│  Campo          │ Valor IA          │ Estado   │ Acción          │
│  Razón social   │ Loma Negra        │ ✓ OK     │ [editar]        │
│  RUT            │ 12.345.678-9      │ ⚠ revisar│ [editar]        │
│  Ejercicio      │ 2025              │ ✓ OK     │                 │
│  Moneda         │ ARS               │ ✓ OK     │                 │
│  Escala         │ Millones          │ ✓ OK     │                 │
├─────────────────────────────────────────────────────────────────┤
│              [ Confirmar identificación ]  ← único CTA principal  │
│  Secundario: Re-leer PDF con IA (solo si algo está mal)         │
└─────────────────────────────────────────────────────────────────┘
```

**Cambios vs. hoy:**

- Eliminar de la fase A: “Reclasificar rubros y validar” → mover a Fase B o menú “Acciones avanzadas”.
- Eliminar el modal “¿Qué botón usar?” reemplazándolo por copy inline claro.
- La franja superior (`revision-meta-strip`) y el formulario de abajo **se fusionan** en una sola tarjeta; hoy hay duplicación visual (mismos campos dos veces).
- Bloquear scroll a Fase B hasta confirmar identificación (soft gate: se puede mirar, no editar líneas).

**Botones que quedan en Fase A:**

| Botón | Cuándo |
|-------|--------|
| Confirmar identificación | Siempre — único requisito para avanzar |
| Re-leer del PDF con IA | Opcional — datos inferidos incorrectos |
| Ver documento / Texto IA | Consulta — no son “aprobaciones” |

---

### Fase B — Líneas, plan de cuentas y cuadratura

**Layout propuesto: panel dividido persistente**

```
┌──────────────────────────┬──────────────────────────────────────┐
│  CUADRATURA (sticky)     │  LÍNEAS — solo lo que requiere acción │
│  1 Activo    12.345 M    │  Filtro: [Dudosas] [Sin rubro] [Todas]│
│  2 Pasivo     8.901 M    │                                      │
│  3 Patrimonio 3.400 M    │  □ Efectivo y equivalentes  → 1.1.01 │
│  ─────────────────────   │     conf 92%  [Aplicar IA] [✓]       │
│  Dif: 44 M  ⚠            │  □ Otros activos         → (sin rubro)│
│  [IA: sugerir ajuste]    │     conf 41%  [Elegir rubro ▼]       │
│  [Ver líneas que impactan]│  ...                                 │
└──────────────────────────┴──────────────────────────────────────┘
```

#### 3.1 Política de clasificación IA (minimizar trabajo manual)

| Confianza clasificación | Comportamiento propuesto |
|-------------------------|--------------------------|
| ≥ 90 % | Auto-aplicar rubro al cargar revisión; línea en estado “IA aplicada — pendiente confirmación masiva” |
| 70–89 % | Pre-seleccionar rubro en UI; usuario solo confirma con un ✓ en lote |
| < 70 % o sin rubro | Entrar en cola “Requiere decisión”; aparece en filtro por defecto |

**Al entrar a Fase B, ejecutar automáticamente:**

1. `clasificar-ia-dudosas` en background (ya existe el endpoint).
2. Auto-aplicar sugerencias por encima del umbral configurable (nuevo parámetro en Admin).
3. Mostrar resumen: *“IA clasificó 47/52 líneas. Quedan 5 para revisar.”*

**Botones de línea simplificados:**

| Hoy | Propuesta |
|-----|-----------|
| Guardar 💾 + Aprobar ✓ + Sugerir IA 🪄 | **Un solo botón “Confirmar”** por línea (guarda + aprueba) |
| Sugerir IA manual por línea | Solo visible en cola de dudas |
| Reclasificar masiva por denominación | Mantener en menú contextual (clic derecho / ⋮) |

#### 3.2 Cuadratura accionable

Cuando `1 ≠ 2 + 3`:

1. Mostrar **top 5 líneas que más mueven la diferencia** (heurística: líneas recién reclasificadas, montos grandes sin rubro, rubros con convención de signo invertido).
2. Botón **“Reintentar cuadratura con IA”** — prompt que envía totales parciales + líneas sin clasificar al modelo para proponer reclasificaciones (nuevo endpoint, wrapper sobre lógica existente).
3. Enlace directo desde la diferencia al filtro “líneas que impactan cuadratura”.

#### 3.3 Eliminar / relegar controles del footer

| Control actual | Propuesta |
|----------------|-----------|
| 3 chips (Identificación / Validaciones / Líneas) | Mantener — son útiles como semáforo |
| Checkbox “Aprobar pendientes y continuar” | **Reemplazar** por acción explícita en modal de cierre (ver §4) |
| Botón Evaluar | Integrar validaciones **inline** en cuadratura e identificación; Evaluar solo para casos complejos (menú ⋮) |
| Revisar y aprobar ficha | Renombrar a **“Cerrar revisión”** con modal de decisión |

---

## 4. Cierre de revisión — dos caminos

### Camino 1 — Ficha completa *(ideal)*

Requisitos (como hoy, pero más claros en UI):

- [x] Identificación confirmada
- [x] Todas las líneas con rubro asignado
- [x] Cuadratura OK (o reconocida explícitamente)
- [x] Validaciones críticas resueltas

**CTA:** `Cerrar y generar informe`

### Camino 2 — Cierre parcial *(nuevo — lo que pedís)*

Para cuando el analista dice *“hasta acá llegué, no importa cuadrar”*:

```
┌─────────────────────────────────────────────────────────────┐
│  Cerrar revisión con observaciones                          │
│                                                             │
│  ☐ Confirmo que revisé la identificación del expediente    │
│  ☐ Acepto cerrar sin cuadratura (diferencia: 44 M)         │
│  ☐ Acepto N líneas sin rubro / sin confirmar               │
│                                                             │
│  Motivo (obligatorio):                                      │
│  [ Documento incompleto / plazo comité / datos suficientes ]│
│                                                             │
│  [ Cancelar ]  [ Cerrar y generar informe parcial ]         │
└─────────────────────────────────────────────────────────────┘
```

**Comportamiento backend sugerido:**

- Nuevo flag en ficha: `cierreParcial: true` + `motivoCierreParcial: string`.
- Validaciones no resueltas quedan en `validacionesResumen` del informe (ya se incluyen inconsistencias).
- El informe se genera con banner: *“Ficha cerrada con observaciones — cuadratura no verificada”*.
- Auditoría registra quién aceptó el cierre parcial.

Esto reemplaza el checkbox críptico “Aprobar pendientes (líneas y validaciones) y continuar” por un gesto **consciente y trazable**.

---

## 5. Visibilidad de extracción IA y plan de cuentas

### 5.1 Panel “Origen de datos” (nuevo, colapsable)

Mostrar en sidebar o pestaña:

| Origen | Cantidad | Ejemplo |
|--------|----------|---------|
| Extraído IA — alta confianza | 40 | Montos, denominaciones |
| Clasificado IA — auto-aplicado | 35 | Rubro asignado automáticamente |
| Corregido por analista | 3 | Monto editado manualmente |
| Carga manual | 0 | — |

Enlace a “Texto extraído por IA” integrado aquí, no solo en header.

### 5.2 Trazabilidad línea ↔ plan de cuentas

Por cada línea en cola de dudas, mostrar:

```
Denominación PDF: "Inversiones temporarias"
  ↳ IA sugiere: 1.2.03 — Inversiones corrientes (78%)
  ↳ Candidatos: 1.2.03 (78%) | 1.2.01 (12%) | 1.1.05 (6%)
  ↳ Página PDF: 4  [ver highlight]
  ↳ Convención signo: normal · Estado: Activo
```

Esto usa datos que **ya existen** (`candidatosAsistidos`, `confianzaClasificacion`, `paginaNumero`) pero hoy están ocultos hasta expandir sugerencia IA.

### 5.3 Vista split documento + datos (recuperar promesa del help)

`pageInfo.ts` dice *“Vista dividida: documento fuente y datos extraídos lado a lado”* pero la implementación actual abre el PDF en modal. Propuesta:

- Modo split opcional (toggle en header): PDF izquierda 40 %, datos derecha 60 %.
- Al clic en página de una línea, scroll del PDF a esa página.

---

## 6. Mapa de botones — antes vs. después

### Header

| Antes | Después |
|-------|---------|
| Ver documento | Ver documento |
| Texto extraído por IA | → Mover a panel Origen IA |
| Reprocesar | → Menú ⋮ Acciones avanzadas |
| Reiniciar a foja cero | → Menú ⋮ (con confirmación fuerte) |

### Identificación

| Antes | Después |
|-------|---------|
| Confirmar identificación | **Confirmar identificación** ✓ |
| Re-leer del PDF con IA | Re-leer del PDF (secundario) |
| Reclasificar rubros y validar | → Fase B, menú avanzado |
| Historial | Mantener |
| ℹ ¿Qué botón usar? | **Eliminar** |

### Líneas

| Antes | Después |
|-------|---------|
| Clasificar dudosas con IA | Auto al entrar + botón “Re-clasificar dudas” |
| Agregar línea | Mantener |
| Por fila: 📄 🪄 💾 ✓ | 📄 ver PDF · Confirmar (único) · 🪄 solo si duda |

### Footer

| Antes | Después |
|-------|---------|
| Checkbox aprobar pendientes | → Modal cierre parcial |
| Evaluar | → Inline + menú avanzado |
| Revisar y aprobar ficha | **Cerrar revisión** |

**De ~12 acciones primarias → 4:** Confirmar identificación · Confirmar línea(s) · Cerrar revisión · Ver documento.

---

## 7. Arquitectura frontend (deuda técnica)

Para implementar lo anterior sin seguir agrandando el monolito:

```
RevisionView.vue (orquestador ~300 líneas)
├── RevisionPhaseNav.vue      ← reactivar RevisionStepNav con 2 pasos
├── RevisionIdentificacion.vue
├── RevisionLineasPanel.vue
│   ├── RevisionCuadraturaSticky.vue
│   └── RevisionLineList.vue  (existente, simplificar acciones)
├── RevisionCierreModal.vue   ← completo vs. parcial
└── composables/
    ├── useRevisionMetadatos.ts
    ├── useRevisionLineas.ts
    └── useRevisionCierre.ts
```

Beneficios: testeable, lazy-load de Fase B, menos refs en un solo archivo.

---

## 8. Cambios backend sugeridos (mínimos)

| Endpoint / cambio | Propósito |
|-------------------|-----------|
| `POST /casos/:id/cerrar-revision-parcial` | Cierre con flags + motivo |
| `POST /casos/:id/auto-clasificar-entrada` | IA al abrir revisión + auto-aplicar umbral |
| `GET /casos/:id/revision-resumen` | Origen datos, contadores, top líneas cuadratura |
| Parámetro `umbralAutoAplicarClasificacion` en config | Admin |
| Informe: sección “Limitaciones de la ficha” si `cierreParcial` | Transparencia al comité |

Reutilizar endpoints existentes donde sea posible (`clasificar-ia-dudosas`, `resolver-pendientes-revision`, `aprobar-ficha`).

---

## 9. Plan de implementación por iteraciones

### Iteración 1 — Quick wins (1–2 sprints)

- [x] Fusionar meta-strip + formulario identificación en una tarjeta
- [x] Renombrar “Revisar y aprobar ficha” → “Cerrar revisión”
- [x] Reemplazar checkbox footer por modal de cierre con opción parcial
- [x] Filtro por defecto en líneas: “Requieren acción”
- [x] Mover Reprocesar / Reiniciar / Reclasificar a menú “Acciones avanzadas”
- [x] Eliminar modal “¿Qué botón usar?”

> **Estado:** implementado 2026-03-13. Cierre parcial persiste `cierreParcial` + `motivoCierreParcial` en ficha.

### Iteración 2 — Flujo guiado (2–3 sprints)

- [x] Activar `RevisionStepNav` con 2 pasos: Identificación → Líneas y cuadratura
- [x] Cuadratura sticky arriba de la grilla de líneas
- [x] Auto-ejecutar clasificación IA al confirmar identificación
- [x] Unificar Guardar + Aprobar línea en “Confirmar”

> **Estado:** implementado 2026-03-13.

### Iteración 3 — IA proactiva y trazabilidad (2 sprints)

- [x] Auto-aplicar clasificaciones ≥ umbral *(vía IA masiva al confirmar identificación + persistencia previa)*
- [x] Panel “Origen de datos”
- [x] “Líneas que impactan cuadratura”
- [x] Modo split PDF + datos

> **Estado:** implementado 2026-03-13.

### Iteración 4 — Cierre parcial formal (1 sprint)

- [x] Endpoint y flag `cierreParcial`
- [x] Banner en informe generado
- [x] Auditoría de cierre con observaciones *(ya en `aprobar-ficha`)*

> **Estado:** implementado 2026-03-13. DTO `FichaCanonicaDto` expone `cierreParcial` + `motivoCierreParcial`.

---

## 10. Criterios de éxito (métricas)

| Métrica | Hoy (estimado) | Objetivo |
|---------|----------------|----------|
| Clics hasta confirmar identificación | 2–3 (scroll + botón) | 1 |
| Clics por línea en balance típico | 2–4 (rubro + guardar + aprobar) | 0–1 (solo excepciones) |
| % líneas auto-clasificadas sin intervención | ~0 % (manual) | ≥ 80 % |
| Tiempo medio en pantalla revisión | ? | −40 % |
| Uso del modal “¿Qué botón usar?” | > 0 | 0 (eliminado) |
| Cierres parciales trazados | 0 (checkbox oculto) | 100 % con motivo |

---

## 11. Wireframe resumido del flujo objetivo

```
[Bandeja] → [Revisión FFA-2026-00014]
                │
                ▼
         ┌──────────────┐
         │ Paso 1/2     │
         │ Identificación│─── Confirmar ───┐
         └──────────────┘                   │
                │                           ▼
                ▼                  ┌──────────────┐
         ┌──────────────┐           │ Paso 2/2     │
         │ IA clasifica │──────────▶│ Líneas +     │
         │ en background│           │ Cuadratura   │
         └──────────────┘           └──────┬───────┘
                                           │
                          ┌────────────────┼────────────────┐
                          ▼                ▼                ▼
                   Cuadratura OK    Cuadratura ≠      Usuario abandona
                          │                │           cuadratura
                          ▼                ▼                ▼
                 Cerrar completo    IA sugiere ajuste   Cierre parcial
                          │                │           (con motivo)
                          └────────────────┴────────────────┘
                                           │
                                           ▼
                                    [Generar informe]
```

---

## 12. Conclusión

La pantalla `/revision` **ya tiene las capacidades técnicas** (extracción IA, clasificación, cuadratura, validaciones, informe). El problema es de **orquestación y jerarquía visual**: demasiados botones de aprobación con granularidades distintas compiten por atención.

La propuesta reduce el trabajo del analista a:

1. **Confirmar** quién es el expediente (datos referenciales).
2. **Revisar excepciones** que la IA no resolvió con confianza.
3. **Decidir cómo cerrar** — completo o con observaciones — y pasar al informe.

Todo lo demás (reprocesar, reiniciar, reclasificar masiva, evaluar validaciones técnicas) pasa a un menú de acciones avanzadas para power users, sin contaminar el camino feliz.

---

*Documento generado a partir del análisis de `RevisionView.vue`, `RevisionLineList.vue`, `RevisionSplitView.vue`, `casos-revision.ts` y `revision.ts`.*
