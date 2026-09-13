# Especificación Técnica — COMO implementar FFA

**Cliente:** ECR Salud — Área de Factoring  
**Versión:** 1.0  
**Fecha:** Septiembre 2026  
**Documento complementario:** [ESPECIFICACION-FUNCIONAL-FFA.md](./ESPECIFICACION-FUNCIONAL-FFA.md) (catálogo QUÉ + cuadro de avance)

---

## 1. Relación QUÉ ↔ COMO

| Documento | Rol |
|-----------|-----|
| **ESPECIFICACION-FUNCIONAL-FFA.md** | Catálogo de 440 ítems (408 software). Fuente de verdad de completitud. Cuadro de avance ESTA/NO ESTA. |
| **ESPECIFICACION-TECNICA-COMO.md** (este) | Factibilidad, arquitectura, modelo de datos, APIs, workers, estructura de repo y orden de implementación para codear. |
| **avance-funcional.json** | Estado por ítem (`NO ESTA` / `EN PROGRESO` / `ESTA` / `N/A`). Actualizar con `python docs/scripts/actualizar-cuadro-avance.py`. |

Cada módulo implementado debe mapearse a IDs del catálogo QUÉ (ej.: ingesta → A.1–A.24, AA.1).

---

## 2. Análisis de factibilidad

### 2.1 Viabilidad técnica — **ALTA**

| Factor | Evaluación | Fundamento |
|--------|------------|------------|
| Stack Vue + Node + MongoDB | Viable | Ecosistema maduro; MongoDB encaja con documentos heterogéneos, fichas anidadas y versionado de configuraciones. |
| Extracción multimodal vía API | Viable | Desacoplado con adapter (`ExtractionProvider`); permite OpenAI/Anthropic/Google u on-prem sin cambiar negocio. |
| Cola async BullMQ + Redis | Viable | Patrón estándar en Node para pipeline documental paralelo (O.3–O.19). |
| Umbral 85% + revisión por excepción | Viable | Lógica determinística sobre scores por línea; no requiere ML propio en v1. |
| Plan de cuentas versionado | Viable | Config en MongoDB + snapshots por caso; bloqueante de Fase 1 del proyecto cliente. |
| Integración correo (IMAP/Graph) | Viable | `imapflow` o Microsoft Graph según casilla ECR; worker dedicado de ingesta. |
| Informes con plantilla Word/HTML | Viable | `docxtemplater` o motor HTML→PDF; plantilla institucional como asset versionado. |
| Despliegue nube u on-prem | Viable | Docker Compose / K8s + MinIO; sin vendor lock-in en almacenamiento. |

### 2.2 Viabilidad operativa — **MEDIA-ALTA** (depende del cliente)

| Dependencia | Riesgo | Mitigación |
|-------------|--------|------------|
| Plan de cuentas saneado (E.*, Y.1–Y.2) | **Alto** — bloquea clasificación | Sprint 0: importador + UI admin; no avanzar F2 sin acta de aprobación. |
| Plantilla informe comité (M.*, Y.4) | **Medio** | Mock template en dev; generador con secciones fijas/variables desde JSON. |
| Indicadores y fórmulas (L.*, Y.3) | **Medio** | Motor de expresiones (`mathjs` o DSL simple); admin UI en Fase 3. |
| Casos reales UAT (Y.5) | **Medio** | Dataset anonimizado en `fixtures/` desde Fase 1. |
| Marco datos terceros / despliegue (S.7, Y.7) | **Medio** | Abstracción `StorageProvider` + env; decisión antes de prod. |
| Calidad documentos escaneados | **Medio-alto** | Política excepciones (B.16); KPI cobertura (U.8); no prometer 100% OCR. |

### 2.3 Viabilidad de plazos — **8 semanas efectivas**

Alineado con propuesta original (~472 h equipo):

| Fase | Semanas | Entregable técnico | Grupos QUÉ prioritarios |
|------|---------|-------------------|-------------------------|
| **S0** Setup | 0.5 | Monorepo, Docker, CI, auth básico | Q.12, S.1, R.15 |
| **F1** Modelo canónico | 1 | Plan cuentas, contribuyentes, import config | E, AB, AE, W |
| **F2** Núcleo pipeline | 4 | Ingesta → validación → estación revisión | A–H, I, J, O, AC, AA.1–AA.6 |
| **F3** Indicadores + informe + repo | 1 | KPIs, informes, consolidación | K, L, M, N, AA.7–AA.8 |
| **F4** UAT + hardening | 1 | Seguridad, KPIs dashboard, ajustes | P, U, S, AF |
| **F5** Go-Live | 0.5 | Prod, Hypercare | V, Z |

**Conclusión:** factible en plazo si F1 no se bloquea >1 semana por dependencias ECR.

### 2.4 Riesgos técnicos y decisiones

| Riesgo | Probabilidad | Impacto | Decisión COMO |
|--------|--------------|---------|---------------|
| Costo/latencia API extracción | Media | Alto | Cache por hash de página; batch nocturno; límite de reintentos (C.7, O.8). |
| Clasificación semántica imprecisa | Alta | Medio | Reglas primero (F.2), embeddings locales opcionales (`@xenova/transformers` o API); umbral 85% + revisión. |
| Concurrencia en revisión | Baja | Medio | Optimistic locking en `casos` (`version` field); J.19. |
| Crecimiento MongoDB | Media | Medio | TTL en logs; archivar documentos S3; índices compuestos. |
| Cambio proveedor extracción | Media | Bajo | Interface `IExtractionProvider`; config por env. |

---

## 3. Stack tecnológico definitivo

```
┌─────────────────────────────────────────────────────────────┐
│  Vue 3 + Vite + Pinia + Vue Router + Tailwind (frontend)    │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS / REST + SSE (progreso)
┌───────────────────────────▼─────────────────────────────────┐
│  Node.js 20 LTS + Fastify + TypeScript (API)                │
│  - Auth JWT + refresh                                       │
│  - Swagger / OpenAPI                                        │
└───────┬───────────────────────────────┬─────────────────────┘
        │                               │
        ▼                               ▼
┌───────────────┐              ┌────────────────┐
│ MongoDB 7     │              │ Redis 7        │
│ (datos)       │              │ BullMQ (colas) │
└───────────────┘              └────────┬───────┘
                                        │
                        ┌───────────────▼───────────────┐
                        │ Workers Node (pipeline)       │
                        │ ingest | preprocess | extract │
                        │ normalize | classify | validate│
                        └───────────────┬───────────────┘
                                        │
                        ┌───────────────▼───────────────┐
                        │ MinIO / S3 (documentos)     │
                        └─────────────────────────────┘
```

| Componente | Tecnología | Versión mínima |
|------------|------------|----------------|
| Frontend | Vue 3, Vite, TypeScript, Pinia | Vue 3.4+ |
| UI | Tailwind CSS, Headless UI o shadcn-vue | — |
| PDF viewer | `pdfjs-dist` en canvas | — |
| API | Fastify, `@fastify/jwt`, `@fastify/multipart` | Node 20 LTS |
| ODM | Mongoose | 8.x |
| Colas | BullMQ, ioredis | 5.x |
| Object storage | `@aws-sdk/client-s3` (compatible MinIO) | — |
| Email in | `imapflow` o MS Graph API | — |
| Email out | Nodemailer | — |
| Extracción IA | Adapter → OpenAI / Anthropic (configurable) | — |
| Informes | `docxtemplater` + `pizzip` o Puppeteer HTML→PDF | — |
| Auth | JWT + bcrypt; roles RBAC | — |
| Contenedores | Docker Compose (dev); prod: Compose o K8s | — |

---

## 4. Arquitectura lógica

### 4.1 Servicios (monorepo)

```
ffa/
├── apps/
│   ├── web/                 # Vue 3 SPA
│   ├── api/                 # Fastify REST
│   └── worker/              # BullMQ consumers (multi-proceso)
├── packages/
│   ├── shared/              # Tipos TS, enums, validadores Zod
│   ├── db/                  # Schemas Mongoose, repos
│   └── pipeline/            # Motores: extract, normalize, classify, validate
├── docker/
│   ├── docker-compose.yml
│   └── docker-compose.prod.yml
├── docs/
├── insumos/
└── fixtures/                # PDFs/casos de prueba anonimizados
```

### 4.2 Pipeline — colas BullMQ

| Cola | Job | Input | Output |
|------|-----|-------|--------|
| `ingest` | `process-email`, `process-upload` | raw file / email | `caso` + doc en S3 → `preprocess` |
| `preprocess` | `preprocess-document` | docId | páginas normalizadas, tipo doc → `extract` |
| `extract` | `extract-pages` | docId | `lineas_contables` crudas → `normalize` |
| `normalize` | `normalize-case` | casoId | metadatos + montos normalizados → `classify` |
| `classify` | `classify-case` | casoId | rubros + confianza → `validate` |
| `validate` | `validate-case` | casoId | semáforo, flags revisión → notificar / `review` |
| `analyze` | `compute-indicators` | fichaId | indicadores → `report` |
| `report` | `generate-report` | fichaId | informe doc/pdf en S3 |

**Re-procesamiento parcial (O.16–O.17):** jobs `reclassify-case`, `revalidate-case`, `recompute-indicators` sin repetir colas upstream.

### 4.3 Principios de diseño

1. **Modular (AD.5):** cada motor en `packages/pipeline` con interface; extracción intercambiable.
2. **Auditable (AD.6, P.*):** todo job emite eventos a `auditoria_eventos` con payload mínimo + refs.
3. **Snapshot de config:** al cerrar clasificación, congelar `planCuentasVersionId`, `reglasVersionId` en el caso.
4. **Idempotencia:** jobs usan `jobId = ${casoId}:${stage}:${version}` para evitar duplicados.

---

## 5. Modelo de datos (MongoDB)

Convenciones globales:
- `_id`: ObjectId
- Timestamps: `createdAt`, `updatedAt` (Mongoose)
- Soft delete donde aplique: `deletedAt`
- Referencias: ObjectId con `ref`; snapshots embebidos cuando se requiere auditoría histórica

### 5.1 Diagrama entidad-relación (lógico)

```
contribuyentes ──< casos ──< documentos_fuente ──< paginas_documento
       │              │
       │              ├──< lineas_contables
       │              ├──< validaciones_resultado
       │              └──> fichas_canonicas ──< indicadores_calculados
       │                        │
       │                        └──< informes_comite
       └──< criterios_aprobados

plan_cuentas_versiones ──< rubros_institucionales
reglas_clasificacion_versiones
indicador_definiciones_versiones
plantilla_informe_versiones
configuracion_sistema (singleton)
usuarios
auditoria_eventos
aprobaciones_config
notificaciones_log
```

### 5.2 Colección: `usuarios`

```typescript
{
  _id: ObjectId,
  email: string,                    // unique
  passwordHash: string,
  nombre: string,
  rol: 'admin' | 'analista' | 'referente' | 'solo_lectura' | 'product_owner',
  activo: boolean,
  ultimoAcceso?: Date
}
```

Índices: `{ email: 1 }` unique.

### 5.3 Colección: `contribuyentes`

```typescript
{
  _id: ObjectId,
  rut: string,                      // normalizado, unique sparse
  razonSocial: string,
  denominacionesAlternativas: string[],
  metadata?: Record<string, unknown>,
  mergedIntoId?: ObjectId,          // AB.5 fusión
  createdAt, updatedAt
}
```

Índices: `{ rut: 1 }` unique; `{ razonSocial: 'text', denominacionesAlternativas: 'text' }`.

### 5.4 Colección: `casos`

Estado central del pipeline (AC.*).

```typescript
type CasoEstado =
  | 'recibido' | 'en_cola' | 'preprocesando' | 'extrayendo'
  | 'normalizando' | 'clasificando' | 'validando' | 'en_revision'
  | 'aprobado' | 'informe_generado' | 'rechazado' | 'error'
  | 'pendiente_calidad';

{
  _id: ObjectId,
  numero: string,                   // humano: FFA-2026-00001
  contribuyenteId?: ObjectId,
  loteId?: ObjectId,                // A.6 correos multi-adjunto
  canal: 'correo' | 'portal' | 'manual_alternativa',
  estado: CasoEstado,
  estadoHistorial: [{
    estado: CasoEstado,
    at: Date,
    by?: ObjectId,
    nota?: string
  }],
  periodo?: { desde: Date, hasta: Date, ejercicio?: number },
  moneda?: 'CLP' | 'USD' | 'UF' | string,
  escala?: 'unidades' | 'miles' | 'millones' | 'indeterminada',
  semaforo?: 'verde' | 'amarillo' | 'rojo',
  confianzaGlobal?: number,         // 0-100
  umbralAplicado?: number,
  asignadoA?: ObjectId,             // analista J.17
  // Snapshots config al procesar
  planCuentasVersionId?: ObjectId,
  reglasVersionId?: ObjectId,
  indicadoresVersionId?: ObjectId,
  plantillaInformeVersionId?: ObjectId,
  observaciones?: string,
  rechazoMotivo?: string,
  version: number,                  // optimistic lock J.19
  timestamps...
}
```

Índices: `{ estado: 1, createdAt: -1 }`, `{ contribuyenteId: 1, 'periodo.ejercicio': -1 }`, `{ asignadoA: 1, estado: 1 }`.

### 5.5 Colección: `documentos_fuente`

```typescript
{
  _id: ObjectId,
  casoId: ObjectId,
  nombreOriginal: string,
  mimeType: string,
  storageKey: string,               // S3 path original
  hashSha256: string,               // A.22 duplicados
  canal: 'correo' | 'portal' | 'manual_alternativa',
  recepcion: {
    at: Date,
    remitente?: string,             // email
    usuarioId?: ObjectId,
    asunto?: string,
    messageId?: string
  },
  calidadOrigen: 'nativo' | 'escaneado_legible' | 'degradado' | 'ilegible',
  paginaCount: number,
  tipoDocumento?: 'balance_8col' | 'balance_clasificado' | 'estado_resultados'
    | 'ifrs' | 'mixto' | 'desconocido',
  procesamiento: {
    etapaActual?: string,
    progresoPct?: number,
    ultimoError?: string
  }
}
```

### 5.6 Colección: `paginas_documento`

```typescript
{
  _id: ObjectId,
  documentoId: ObjectId,
  numeroPagina: number,             // 1-based
  storageKeyPreview?: string,       // imagen normalizada B.10
  orientacionCorregida: boolean,
  calidadPagina?: number
}
```

### 5.7 Colección: `lineas_contables`

Núcleo trazable C.*, D.*, F.*.

```typescript
{
  _id: ObjectId,
  casoId: ObjectId,
  documentoId: ObjectId,
  paginaNumero: number,
  bbox?: { x: number, y: number, w: number, h: number },  // trazabilidad visual
  lineaEnPagina?: number,
  codigoOrigen?: string,
  denominacionOriginal: string,
  denominacionNormalizada?: string,
  columnaOrigen?: string,           // 8 columnas: suma, saldo, etc.
  montoOriginal: number,
  montoNormalizado?: number,
  signoAplicado?: 'positivo' | 'negativo',
  // Clasificación
  rubroInstitucionalId?: ObjectId,
  rubroCodigo?: string,             // snapshot
  clasificacionPropuesta?: ObjectId,
  clasificacionFinal?: ObjectId,
  confianzaExtraccion?: number,
  confianzaClasificacion?: number,
  requiereRevision: boolean,
  origenClasificacion?: 'regla' | 'semantica' | 'asistida' | 'criterio_contribuyente' | 'manual',
  estado: 'cruda' | 'normalizada' | 'clasificada' | 'aprobada' | 'rechazada'
}
```

Índices: `{ casoId: 1, requiereRevision: 1 }`, `{ documentoId: 1, paginaNumero: 1 }`.

### 5.8 Colección: `plan_cuentas_versiones`

```typescript
{
  _id: ObjectId,
  version: string,                    // semver: 1.0.0
  estado: 'borrador' | 'pendiente_aprobacion' | 'aprobado' | 'obsoleto',
  aprobacion?: { by: ObjectId, at: Date, comentario?: string },
  notas?: string,
  createdBy: ObjectId
}
```

### 5.9 Colección: `rubros_institucionales`

Hijos de una versión de plan (E.*).

```typescript
{
  _id: ObjectId,
  planCuentasVersionId: ObjectId,
  codigo: string,                   // unique per version
  nombre: string,
  estadoFinanciero: 'activo' | 'pasivo' | 'patrimonio' | 'resultados',
  corriente?: boolean,
  convencionSigno: 'normal' | 'invertido',
  padreId?: ObjectId,
  orden: number,
  activo: boolean
}
```

Índices: `{ planCuentasVersionId: 1, codigo: 1 }` unique.

### 5.10 Colección: `reglas_clasificacion_versiones` + reglas embebidas

```typescript
// reglas_clasificacion_versiones
{ _id, version, estado, aprobacion?, reglas: ReglaClasificacion[] }

interface ReglaClasificacion {
  id: string,
  prioridad: number,
  tipo: 'patron_denominacion' | 'codigo_origen' | 'regex' | 'contribuyente',
  contribuyenteId?: ObjectId,
  patron: string,
  rubroInstitucionalId: ObjectId,
  activa: boolean
}
```

### 5.11 Colección: `criterios_aprobados` (memoria G.*)

```typescript
{
  _id: ObjectId,
  contribuyenteId: ObjectId,
  denominacionOrigen: string,       // normalizada para match
  rubroInstitucionalId: ObjectId,
  aprobadoPor: ObjectId,
  aprobadoAt: Date,
  casoOrigenId?: ObjectId,
  activo: boolean,
  version: number
}
```

Índices: `{ contribuyenteId: 1, denominacionOrigen: 1 }`.

### 5.12 Colección: `validaciones_resultado`

```typescript
{
  _id: ObjectId,
  casoId: ObjectId,
  tipo: 'cuadratura' | 'coherencia_estados' | 'integridad_agrupacion'
    | 'debito_credito' | 'escala_no_declarada' | 'clasificacion_origen'
    | 'ejercicio_desactualizado' | 'activo_sobrevalorado',
  severidad: 'info' | 'warning' | 'critical',
  passed: boolean,
  mensaje: string,
  lineasInvolucradas?: ObjectId[],
  metadata?: Record<string, unknown>,
  confirmadaPorAnalista?: boolean,
  at: Date
}
```

### 5.13 Colección: `fichas_canonicas`

```typescript
{
  _id: ObjectId,
  casoId: ObjectId,
  contribuyenteId: ObjectId,
  version: number,
  estado: 'borrador' | 'en_revision' | 'aprobada' | 'rechazada',
  planCuentasVersionId: ObjectId,
  // Totales bajo modelo institucional
  balance: {
    activoCorriente: number,
    activoNoCorriente: number,
    pasivoCorriente: number,
    pasivoNoCorriente: number,
    patrimonio: number,
    detalle: [{ rubroId: ObjectId, codigo: string, monto: number, lineasIds: ObjectId[] }]
  },
  estadoResultados: {
    detalle: [{ rubroId: ObjectId, codigo: string, monto: number, lineasIds: ObjectId[] }],
    utilidad?: number
  },
  validacionesResumen: { cuadraturaOk: boolean, semaforo: string },
  aprobadaPor?: ObjectId,
  aprobadaAt?: Date,
  observaciones?: string
}
```

### 5.14 Colección: `indicador_definiciones_versiones`

```typescript
{
  _id: ObjectId,
  version: string,
  estado: 'borrador' | 'aprobado' | 'obsoleto',
  indicadores: [{
    codigo: string,
    nombre: string,
    categoria: 'liquidez' | 'endeudamiento' | 'rentabilidad' | 'capital_trabajo' | 'factoring',
    formula: string,                // DSL: (AC_CORRIENTE / PC_CORRIENTE)
    rubrosRequeridos: string[],     // códigos rubro
    obligatorio: boolean
  }]
}
```

### 5.15 Colección: `indicadores_calculados`

```typescript
{
  _id: ObjectId,
  fichaId: ObjectId,
  indicadorCodigo: string,
  definicionVersionId: ObjectId,
  valor: number | null,
  calculable: boolean,
  error?: string,
  lineasParticipantes: ObjectId[],
  calculadoAt: Date
}
```

### 5.16 Colección: `plantilla_informe_versiones`

```typescript
{
  _id: ObjectId,
  version: string,
  estado: 'borrador' | 'aprobado' | 'obsoleto',
  storageKey: string,               // .docx en S3
  secciones: [{
    id: string,
    nombre: string,
    tipo: 'fija' | 'variable' | 'auto',
    placeholder?: string
  }]
}
```

### 5.17 Colección: `informes_comite`

```typescript
{
  _id: ObjectId,
  fichaId: ObjectId,
  casoId: ObjectId,
  plantillaVersionId: ObjectId,
  estado: 'borrador' | 'preliminar' | 'final',
  storageKeyPdf?: string,
  storageKeyDocx?: string,
  apartadosManuales: Record<string, string>,  // J.22, M.17
  generadoPor: ObjectId,
  generadoAt: Date,
  finalizadoAt?: Date
}
```

### 5.18 Colección: `configuracion_sistema` (singleton)

```typescript
{
  _id: 'global',
  umbralConfianza: number,          // default 85
  reintentosMaxPorEtapa: Record<string, number>,
  acuseCorreoTemplate: string,
  notificacionFalloTemplate: string,
  formatosPermitidos: string[],
  retencionDias: number,
  emailIngesta: { host, port, user, encryptedPassword, carpeta },
  extractionProvider: 'openai' | 'anthropic' | 'mock',
  planCuentasVigenteId?: ObjectId,
  reglasVigenteId?: ObjectId,
  indicadoresVigenteId?: ObjectId,
  plantillaVigenteId?: ObjectId
}
```

### 5.19 Colección: `auditoria_eventos`

Append-only (P.*).

```typescript
{
  _id: ObjectId,
  at: Date,
  actorTipo: 'sistema' | 'usuario',
  actorId?: ObjectId,
  casoId?: ObjectId,
  entidad: string,
  entidadId?: ObjectId,
  accion: string,
  payload: Record<string, unknown>,
  configSnapshot?: {
    planCuentasVersionId?: ObjectId,
    umbral?: number
  }
}
```

Índices: `{ casoId: 1, at: -1 }`, `{ at: -1 }` TTL opcional en logs antiguos.

### 5.20 Colección: `aprobaciones_config` (AE.*)

```typescript
{
  _id: ObjectId,
  tipo: 'plan_cuentas' | 'plantilla_informe' | 'indicadores' | 'reglas',
  versionId: ObjectId,
  estado: 'pendiente' | 'aprobado' | 'rechazado',
  solicitadoPor: ObjectId,
  aprobadoPor?: ObjectId,
  comentarios?: string,
  at: Date
}
```

### 5.21 Colección: `notificaciones_log` (T.*)

```typescript
{
  _id: ObjectId,
  tipo: 'acuse' | 'fallo_calidad' | 'revision_requerida' | 'aprobacion_auto' | 'error_critico',
  destinatario: string,
  casoId?: ObjectId,
  enviadoAt: Date,
  estado: 'enviado' | 'fallido',
  error?: string
}
```

---

## 6. API REST (Fastify)

Base: `/api/v1`. Auth Bearer JWT salvo `/auth/*` y webhook ingestión.

### 6.1 Auth y usuarios

| Método | Ruta | Descripción | QUÉ |
|--------|------|-------------|-----|
| POST | `/auth/login` | Login | S.1 |
| POST | `/auth/refresh` | Refresh token | S.1 |
| GET | `/users/me` | Perfil | S.2 |
| CRUD | `/users` | Admin usuarios | R.1 |

### 6.2 Casos y pipeline

| Método | Ruta | Descripción | QUÉ |
|--------|------|-------------|-----|
| GET | `/casos` | Lista + filtros | Q.4, J.16 |
| GET | `/casos/:id` | Detalle + progreso | Q.3, O.9 |
| POST | `/casos/upload` | Portal carga | A.7–A.8 |
| POST | `/casos/:id/reprocess` | Reprocesar | O.16, R.13 |
| PATCH | `/casos/:id/asignar` | Asignar analista | J.17 |
| POST | `/casos/:id/rechazar` | Rechazar | AC.4 |
| POST | `/casos/:id/cancelar` | Cancelar | AC.5 |
| GET | `/casos/:id/lineas` | Líneas (filtro revisión) | J.1 |
| PATCH | `/casos/:id/lineas/:lid` | Corregir línea | J.5–J.7 |
| POST | `/casos/:id/lineas/manual` | Alta manual | J.21 |
| POST | `/casos/:id/aprobar-ficha` | Aprobar ficha | J.12 |
| GET | `/casos/:id/documento/:docId/pagina/:n` | URL preview página | J.3–J.4 |
| GET | `/casos/:id/eventos` | SSE progreso | Q.14 |

### 6.3 Contribuyentes

| Método | Ruta | QUÉ |
|--------|------|-----|
| CRUD | `/contribuyentes` | AB.* |
| POST | `/contribuyentes/:id/merge` | AB.5 |
| GET | `/contribuyentes/:id/historial` | AB.6, N.* |

### 6.4 Configuración

| Método | Ruta | QUÉ |
|--------|------|-----|
| GET/PATCH | `/config` | R.2, R.7–R.10 |
| CRUD | `/plan-cuentas/versions` | E.*, R.3 |
| POST | `/plan-cuentas/versions/:id/aprobar` | AE.1 |
| CRUD | `/reglas/versions` | R.4 |
| CRUD | `/indicadores/versions` | R.5 |
| CRUD | `/plantillas/versions` | R.6, M.16 |
| GET | `/colas/status` | R.12 |

### 6.5 Fichas, indicadores, informes

| Método | Ruta | QUÉ |
|--------|------|-----|
| GET | `/fichas/:id` | K.8 |
| GET | `/fichas/:id/indicadores` | L.12 |
| POST | `/fichas/:id/recalcular-indicadores` | L.11, O.17 |
| POST | `/fichas/:id/informes` | M.1 |
| PATCH | `/informes/:id/apartados` | J.22, M.17 |
| POST | `/informes/:id/finalizar` | M.18 |
| GET | `/informes/:id/download` | Q.15 |

### 6.6 Repositorio, KPIs, auditoría

| Método | Ruta | QUÉ |
|--------|------|-----|
| GET | `/repositorio` | N.7–N.8 |
| GET | `/repositorio/compare` | N.4–N.6 |
| GET | `/kpis` | U.9 |
| GET | `/auditoria` | P.8 |
| GET | `/auditoria/caso/:id/export` | P.9 |

---

## 7. Frontend Vue — módulos

| Ruta | Vista | QUÉ principal |
|------|-------|---------------|
| `/login` | Login | S.1 |
| `/dashboard` | KPIs + cola | Q.7, U.9 |
| `/casos` | Bandeja casos | Q.4–Q.5 |
| `/casos/:id/revision` | Estación revisión split view | J.* |
| `/casos/:id/informe` | Editor apartados + preview | M.*, J.22 |
| `/contribuyentes` | AB.* | |
| `/contribuyentes/:id` | Perfil + historial | N.*, AB.6 |
| `/admin/plan-cuentas` | Árbol rubros + versiones | E.*, R.3 |
| `/admin/reglas` | Reglas clasificación | R.4 |
| `/admin/indicadores` | Fórmulas | R.5 |
| `/admin/plantillas` | Upload plantilla | R.6 |
| `/admin/config` | Umbral, correo, etc. | R.2, R.8–R.10 |
| `/admin/usuarios` | R.1 | |
| `/carga` | Portal upload público/interno | A.7 |

**Componente clave:** `RevisionSplitView` — PDF canvas izquierda (`pdfjs-dist`), tabla líneas derecha, sync scroll/highlight por `bbox`.

---

## 8. Workers — pseudoflujo

```typescript
// packages/pipeline/classifyCase.ts
async function classifyCase(casoId: string) {
  const caso = await Caso.findById(casoId);
  const config = await getVigenteConfig();
  const lineas = await Linea.find({ casoId, estado: 'normalizada' });
  for (const linea of lineas) {
    const result = await classifyLine(linea, {
      reglas: config.reglas,
      criterios: await Criterio.find({ contribuyenteId: caso.contribuyenteId }),
      rubros: await Rubro.find({ planCuentasVersionId: config.planCuentasVigenteId })
    });
    linea.rubroInstitucionalId = result.rubroId;
    linea.confianzaClasificacion = result.confianza;
    linea.requiereRevision = result.confianza < config.umbralConfianza;
    linea.origenClasificacion = result.origen;
    await linea.save();
  }
  await enqueue('validate', { casoId });
}
```

Motores en `packages/pipeline/`:
- `extract/` — `IExtractionProvider`
- `normalize/`
- `classify/` — reglas → semántica → LLM fallback acotado al plan
- `validate/` — reglas H.*
- `indicators/` — parser fórmulas
- `report/` — docxtemplater

---

## 9. Integraciones externas

| Integración | Protocolo | Config |
|-------------|-----------|--------|
| Casilla correo | IMAP IDLE / polling 5 min | `config.emailIngesta` |
| SMTP salida | SMTP TLS | env `SMTP_*` |
| Extracción IA | HTTPS REST | env `EXTRACTION_API_KEY`, provider |
| Almacenamiento | S3 API | env `S3_*` |
| Embeddings (opcional) | Local o API | env `EMBEDDINGS_*` |

**Mock en dev:** `EXTRACTION_PROVIDER=mock` lee fixtures JSON pre-extraídos.

---

## 10. Despliegue

### 10.1 Docker Compose (desarrollo)

Servicios: `web`, `api`, `worker` (replicas: 2), `mongo`, `redis`, `minio`, `mailhog`.

### 10.2 Producción

- **Opción A (on-prem ECR):** VM Linux, Compose, MinIO local, MongoDB replica set 3 nodos.
- **Opción B (nube):** API/worker en containers; MongoDB Atlas; S3; Redis managed.

Variables críticas: `MONGODB_URI`, `REDIS_URL`, `S3_*`, `JWT_SECRET`, `EXTRACTION_*`, `SMTP_*`, `IMAP_*`.

### 10.3 Healthchecks

- `GET /health` — API up
- `GET /health/ready` — Mongo + Redis + S3
- Worker heartbeat en Redis cada 30s

---

## 11. Seguridad (implementación)

| Requisito | Implementación |
|-----------|----------------|
| S.4 TLS | Reverse proxy nginx / traefik |
| S.5 docs sensibles | S3 SSE; presigned URLs expiran 15 min |
| S.6 acceso auditado | Log en `auditoria_eventos` al abrir documento |
| S.11 secretos | Env vars; Docker secrets en prod |
| S.10 Go-Live | `npm audit`, OWASP ZAP baseline en CI |
| RBAC | Middleware Fastify `requireRole(['analista'])` |

---

## 12. Orden de implementación (para empezar a codear)

### Sprint 0 — Bootstrap (2–3 días)

```
[ ] Monorepo pnpm workspaces + TS strict
[ ] docker-compose up (mongo, redis, minio)
[ ] packages/shared — enums CasoEstado, tipos base
[ ] packages/db — schemas usuarios, casos, contribuyentes
[ ] apps/api — Fastify skeleton, auth JWT, /health
[ ] apps/web — Vue 3 login + layout shell
[ ] Seed admin user + config singleton
```
**Marcar QUÉ:** Q.12, S.1, R.15 → `actualizar-cuadro-avance.py --marcar ... ESTA`

### Sprint 1 — Config + contribuyentes (Fase 1 cliente)

```
[ ] CRUD plan cuentas versiones + rubros (árbol)
[ ] Workflow aprobación AE.*
[ ] CRUD contribuyentes AB.*
[ ] Import CSV plan cuentas inicial
[ ] Admin UI plan cuentas
```

### Sprint 2 — Ingesta + storage

```
[ ] Upload portal → S3 + caso + cola preprocess
[ ] Worker ingest (email mock Mailhog)
[ ] Acuse SMTP T.1
[ ] Estados caso AC.*
```

### Sprint 3 — Pipeline core

```
[ ] preprocess → extract (mock) → normalize
[ ] classify (reglas básicas) → validate (cuadratura)
[ ] Auditoría eventos por etapa
```

### Sprint 4 — Estación revisión

```
[ ] API líneas + PATCH
[ ] RevisionSplitView Vue + PDF.js
[ ] Aprobar ficha + criterios_aprobados
[ ] Umbral configurable I.*
```

### Sprint 5 — Ficha + indicadores + informe

```
[ ] Generar ficha_canonica desde líneas aprobadas
[ ] Motor indicadores mathjs
[ ] Generador informe docxtemplater
[ ] Apartados manuales J.22
```

### Sprint 6 — Repo + KPIs + hardening

```
[ ] Repositorio + comparación N.*
[ ] Dashboard KPIs U.*
[ ] Seguridad, tests e2e críticos, UAT
```

---

## 13. Criterios de “listo para codear” — checklist técnico

| # | Criterio | Estado |
|---|----------|--------|
| 1 | Catálogo QUÉ v1.1 con cuadro avance | ✅ |
| 2 | Stack definido Vue/Node/Mongo/Redis/S3 | ✅ |
| 3 | Modelo de datos 21 colecciones | ✅ |
| 4 | API routes mapeadas a QUÉ | ✅ |
| 5 | Pipeline colas definido | ✅ |
| 6 | Estructura monorepo | ✅ |
| 7 | Orden sprints 0–6 | ✅ |
| 8 | Fixtures casos prueba | ⬜ Pendiente (Sprint 0) |
| 9 | Plan cuentas seed ECR | ⬜ Pendiente cliente F1 |

---

## 14. Comandos iniciales (Sprint 0)

```bash
# Estructura (ejecutar en raíz FFA cuando se inicie repo)
pnpm init
mkdir -p apps/web apps/api apps/worker packages/shared packages/db packages/pipeline

# Actualizar avance al completar ítems
python docs/scripts/actualizar-cuadro-avance.py --marcar A.1 ESTA --evidencia "commit abc123"
python docs/scripts/actualizar-cuadro-avance.py
```

---

## 15. Referencias cruzadas

- Catálogo funcional y avance: [ESPECIFICACION-FUNCIONAL-FFA.md](./ESPECIFICACION-FUNCIONAL-FFA.md) §0
- Estado JSON: [avance-funcional.json](./avance-funcional.json)
- Insumos negocio: `insumos/`

---

*Documento COMO v1.0 — Listo para iniciar Sprint 0. Al implementar cada feature, marcar ESTA en `avance-funcional.json` y refrescar cuadro QUÉ.*
