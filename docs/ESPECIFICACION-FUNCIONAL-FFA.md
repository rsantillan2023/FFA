# Especificación Funcional — FFA (Ficha Financiera Automatizada)

**Cliente:** ECR Salud — Área de Factoring  
**Proveedor:** Sooft Technology  
**Versión del documento:** 1.1 (revisión de completitud)  
**Fecha de referencia:** Septiembre 2026  
**Tipo de documento:** Catálogo funcional de completitud — QUÉ debe hacer el sistema (sin análisis ni diseño técnico)

---

## 0. Cuadro de avance del proyecto

> **Documento maestro QUÉ:** este catálogo es la fuente de verdad. Cada ítem se marca **ESTA** o **NO ESTA** en `docs/avance-funcional.json` y se refresca este cuadro con `python docs/scripts/actualizar-cuadro-avance.py`.

**Última actualización:** 2026-09-09

### Resumen global (software)

| Métrica | Valor |
|---------|-------|
| Ítems de software | 408 |
| **ESTA** | 408 |
| **NO ESTA** | 0 |
| EN PROGRESO | 0 |
| N/A | 0 |
| **Avance** | **100.0%** |

### Avance por grupo

| Grupo | Tema | Total | ESTA | NO ESTA | En progreso | N/A | % |
|-------|------|-------|------|---------|-------------|-----|---|
| A | Recepción e ingesta (software) | 24 | 24 | 0 | 0 | 0 | 100.0% |
| B | Preprocesamiento (software) | 16 | 16 | 0 | 0 | 0 | 100.0% |
| C | Extracción (software) | 22 | 22 | 0 | 0 | 0 | 100.0% |
| D | Normalización (software) | 18 | 18 | 0 | 0 | 0 | 100.0% |
| E | Plan de cuentas (software) | 18 | 18 | 0 | 0 | 0 | 100.0% |
| F | Clasificación (software) | 22 | 22 | 0 | 0 | 0 | 100.0% |
| G | Memoria criterios (software) | 12 | 12 | 0 | 0 | 0 | 100.0% |
| H | Validación contable (software) | 20 | 20 | 0 | 0 | 0 | 100.0% |
| I | Umbral / excepción (software) | 14 | 14 | 0 | 0 | 0 | 100.0% |
| J | Estación revisión (software) | 24 | 24 | 0 | 0 | 0 | 100.0% |
| K | Ficha canónica (software) | 15 | 15 | 0 | 0 | 0 | 100.0% |
| L | Indicadores (software) | 15 | 15 | 0 | 0 | 0 | 100.0% |
| M | Informe comité (software) | 19 | 19 | 0 | 0 | 0 | 100.0% |
| N | Repositorio (software) | 17 | 17 | 0 | 0 | 0 | 100.0% |
| O | Orquestación async (software) | 19 | 19 | 0 | 0 | 0 | 100.0% |
| P | Auditoría (software) | 14 | 14 | 0 | 0 | 0 | 100.0% |
| Q | Portal / UX (software) | 15 | 15 | 0 | 0 | 0 | 100.0% |
| R | Administración (software) | 17 | 17 | 0 | 0 | 0 | 100.0% |
| S | Seguridad (software) | 12 | 12 | 0 | 0 | 0 | 100.0% |
| T | Notificaciones (software) | 8 | 8 | 0 | 0 | 0 | 100.0% |
| U | KPIs (software) | 12 | 12 | 0 | 0 | 0 | 100.0% |
| V | Integración ECR (servicio) (servicio/cliente) | 12 | 0 | 12 | 0 | 0 | — |
| W | Entidades negocio (software) | 10 | 10 | 0 | 0 | 0 | 100.0% |
| X | Reglas transversales (software) | 10 | 10 | 0 | 0 | 0 | 100.0% |
| Y | Dependencias cliente (servicio/cliente) | 10 | 0 | 10 | 0 | 0 | — |
| Z | Soporte Go-Live (servicio/cliente) | 6 | 0 | 6 | 0 | 0 | — |
| AA | Pipeline 8 etapas E2E (software) | 8 | 8 | 0 | 0 | 0 | 100.0% |
| AB | Contribuyentes (software) | 7 | 7 | 0 | 0 | 0 | 100.0% |
| AC | Ciclo vida caso (software) | 8 | 8 | 0 | 0 | 0 | 100.0% |
| AD | Principios FFA (software) | 6 | 6 | 0 | 0 | 0 | 100.0% |
| AE | Aprobaciones config (software) | 6 | 6 | 0 | 0 | 0 | 100.0% |
| AF | Capacitación UAT (servicio/cliente) | 4 | 0 | 4 | 0 | 0 | — |

### Entregables servicio / cliente (seguimiento aparte)

| Grupo | Tema | Total | ESTA | NO ESTA |
|-------|------|-------|------|---------|
| V | Integración ECR (servicio) | 12 | 0 | 12 |
| Y | Dependencias cliente | 10 | 0 | 10 |
| Z | Soporte Go-Live | 6 | 0 | 6 |
| AF | Capacitación UAT | 4 | 0 | 4 |

### Barra de avance (solo software)

`████████████████████` 100.0%

<!-- FIN_CUADRO_AVANCE -->

## 1. Propósito de este documento

Este documento es el **catálogo oficial para verificar si el sistema FFA está funcionalmente completo**. Cada ítem numerado es una capacidad verificable: se marca como hecha solo cuando existe, se probó y cumple lo descrito.

Consolida, de forma exhaustiva, **todas las funcionalidades que el proyecto FFA debe cubrir**, derivadas de:

- Propuesta comercial-técnica FFA para ECR Salud (septiembre 2026)
- Distribución de horas y roles del proyecto
- Notas y transcripción de la reunión de validación de Factoring (26/08/2026)

No describe arquitectura, modelos de datos, pantallas ni flujos de implementación. Solo define **qué capacidades debe entregar la plataforma**, **qué debe poder hacer cada actor** y **qué resultados debe producir el sistema**.

### 1.1 Cómo usar este catálogo como checklist de completitud

Para cada ítem del catálogo (A.1, B.1, … AF.4) registrar:

| Estado | Significado |
|--------|-------------|
| **Pendiente** | Aún no implementado |
| **En progreso** | Parcialmente implementado o sin prueba |
| **Hecho** | Implementado y verificado (idealmente con evidencia de prueba) |
| **N/A** | No aplica a esta instalación (documentar motivo) |
| **Excluido** | Fuera de alcance explícito (sección 7) |

**Regla de completitud del sistema:** el FFA se considera funcionalmente completo cuando todos los ítems de los grupos **A–X** y **AA–AF** están en estado **Hecho** o **N/A** documentado, los grupos **Y** (dependencias cliente) están resueltos, y los criterios de la sección 11 se cumplen en UAT/Go-Live. Los grupos **V** y **Z** son entregables de servicio/proyecto, no código.

**Convención de ID:** `[Grupo].[número]` — ej. `J.12` = permitir aprobar la ficha completa.

**Documento COMO (implementación):** [ESPECIFICACION-TECNICA-COMO.md](./ESPECIFICACION-TECNICA-COMO.md) — factibilidad, modelo de datos, APIs y orden de codeo.

**Actualizar avance:**
```bash
python docs/scripts/actualizar-cuadro-avance.py --marcar J.12 ESTA --evidencia "PR #12"
python docs/scripts/actualizar-cuadro-avance.py
```

---

## 2. Contexto del problema que el proyecto debe resolver

El área de Factoring de ECR Salud recibe estados financieros de clientes y contadores externos en formatos heterogéneos: balances tributarios de ocho columnas, balances clasificados, estados auditados bajo IFRS, PDF nativos, escaneados o fotografiados, en pesos, miles de pesos o miles de dólares, con planes de cuenta propios de cada empresa.

Hoy cada caso se procesa manualmente: el analista transcribe línea por línea, clasifica según criterio propio, verifica cuadratura, calcula indicadores y arma el informe de comité. Ese proceso demanda entre **1 y 6 horas por caso** y no puede asignarse a una persona a tiempo completo porque el equipo tiene otras responsabilidades operativas.

El FFA debe transformar ese modelo de **transcripción manual** en un modelo de **revisión por excepción**, con meta operativa de reducir el tiempo por caso a **20–30 minutos**, cuadratura verificada en todos los casos aprobados y trazabilidad completa de cada cifra hasta su documento de origen.

---

## 3. Objetivo general del proyecto

Implementar una plataforma que:

1. Reciba documentos financieros por los mismos canales que el área ya utiliza.
2. Convierta esos documentos en una ficha financiera estructurada bajo el plan de cuentas institucional.
3. Verifique consistencia contable.
4. Genere el informe de comité.
5. Derive al analista únicamente las líneas o casos que no alcancen el umbral de confianza definido.

---

## 4. Objetivos específicos que condicionan las funcionalidades

| # | Objetivo | Implicación funcional |
|---|----------|----------------------|
| O1 | Recepción continua | Captura automática desde correo y portal alternativo, operación fuera de horario laboral, acuse automático al remitente |
| O2 | Extracción y normalización | Conversión de cualquier documento financiero en líneas estructuradas con detección de moneda, escala, período y contribuyente |
| O3 | Clasificación bajo modelo único | Asignación de cada línea a un rubro del plan de cuentas institucional mediante reglas, semántica y memoria por contribuyente |
| O4 | Validación y umbral de confianza | Cuadratura, coherencia e integridad; derivación obligatoria a revisión humana bajo 85% (configurable) |
| O5 | Revisión por excepción | El analista interviene solo sobre líneas dudosas, con documento de origen visible |
| O6 | Indicadores e informe de comité | Cálculo sobre fórmulas configurables y generación sobre plantilla institucional |
| O7 | Procesamiento asíncrono | Múltiples empresas y períodos en paralelo sin bloquear la operación del analista |
| O8 | Repositorio consolidado | Historial estructurado por contribuyente para comparar ejercicios y casos |

---

## 5. Stack tecnológico adoptado para este proyecto

La propuesta original mencionaba React, Python/FastAPI y PostgreSQL. **Para esta especificación se adopta el siguiente stack**, elegido por conveniencia frente a documentos financieros heterogéneos, procesamiento asíncrono intensivo y necesidad de despliegue flexible (nube u on-premise):

| Capa | Tecnología | Rol en el proyecto |
|------|------------|-------------------|
| Frontend | **Vue 3** | Portal de carga, estación de revisión, administración, visualización documento + ficha |
| Backend / API | **Node.js** (runtime LTS) | API REST, lógica de negocio, orquestación de pipelines, integración con servicios externos |
| Base de datos | **MongoDB** | Fichas canónicas, líneas contables, criterios, historial por contribuyente, auditoría, configuraciones versionadas |
| Cola de trabajos | **Redis + BullMQ** | Procesamiento asíncrono en segundo plano, reintentos, paralelismo, aislamiento de errores por documento |
| Almacenamiento documental | **Almacenamiento de objetos compatible S3** (MinIO on-premise o servicio cloud) | Documentos originales, derivados de procesamiento, informes generados |
| Motor de extracción | **Servicio de modelos multimodales vía API** (proveedor intercambiable) | Interpretación de páginas completas con salida estructurada |
| Motor de clasificación | **Reglas declarativas + embeddings semánticos + resolución asistida** | Clasificación bajo plan de cuentas institucional |
| Generación de informes | **Motor de plantillas** sobre formato institucional del comité | Informes exportables en formatos acordados |
| Despliegue | **Contenedores Docker** orquestados con **Docker Compose** (dev/QA) y opción **Kubernetes** o **VM + Compose** (producción) | Separación API / workers / frontend; compatible con nube o infraestructura propia del cliente |
| Workers | **Procesos Node.js dedicados** (consumidores BullMQ) | Pipeline documental desacoplado de la API interactiva |

**Criterio de decisión de procesamiento:** el pipeline documental (extracción → normalización → clasificación → validación) corre en **workers independientes** de la API, encolados en Redis, para que el analista pueda seguir operando mientras el sistema procesa lotes en paralelo en un servidor o nodo aparte.

**Criterio de decisión de despliegue:** arquitectura contenedorizada con almacenamiento de objetos externo a MongoDB, de modo que el cambio entre nube e infraestructura propia de ECR Salud no altere las funcionalidades definidas en este documento.

---

## 6. Alcance funcional — Qué está incluido

El FFA debe cubrir el ciclo completo desde la recepción del documento hasta la generación del informe de comité, incluyendo:

- Formalización y operación del plan de cuentas institucional como modelo de datos único y versionado
- Integración con casilla de correo productiva del área
- Portal de carga alternativo
- Estación de revisión por excepción
- Motor de indicadores con fórmulas configurables
- Repositorio financiero consolidado por contribuyente
- Registro de auditoría y trazabilidad
- Administración de umbral de confianza, indicadores y plantillas sin intervención de desarrollo
- Capacitación, Go-Live y Hypercare (como entregables de servicio, no como código)

---

## 7. Fuera de alcance — Qué NO debe hacer el sistema en esta entrega

Las siguientes capacidades **no forman parte** de las funcionalidades a implementar en este proyecto. Si en el futuro se requieren, se tratarán como evolutivos adicionales:

1. Contravalidación de información financiera contra declaraciones tributarias (formularios 22 y 29)
2. Procesamiento de impuestos al valor agregado y codificaciones asociadas
3. Integración con fuentes externas (Dicom, CMF, nóminas de deuda de terceros)
4. Verificación de veracidad de antecedentes ante organismos o terceros
5. Decisión automatizada de aprobación o rechazo de operaciones de financiamiento
6. Digitalización retroactiva del histórico documental previo al Go-Live

---

## 8. Actores y roles que interactúan con el sistema

| Rol | Responsabilidad frente al FFA |
|-----|------------------------------|
| Analista de Factoring | Revisa excepciones, aprueba fichas, corrige clasificaciones, valida informes |
| Product Owner (ECR Salud) | Prioriza funcionalidades, aprueba entregables de fase, define criterios de negocio |
| Responsable de sistemas (ECR Salud) | Gestiona ambientes, accesos, casilla productiva, marco de tratamiento de datos |
| Referente de usuario | Valida comportamiento funcional, participa en demos y UAT |
| Administrador del sistema | Administra plan de cuentas, umbral, fórmulas, usuarios y configuraciones |
| Remitente externo (cliente/contador) | Envía documentos por correo o portal; recibe acuse de recepción |
| Sistema (automatizado) | Captura, procesa, valida, notifica y encola trabajos sin intervención humana |

---

## 9. Catálogo exhaustivo de funcionalidades

A continuación se enumeran **todas las funcionalidades** que el proyecto debe cubrir, agrupadas por tema. Cada ítem es una capacidad concreta verificable. La numeración es continua dentro de cada grupo.

---

### GRUPO A — Recepción e ingesta documental

**A.1** Conectar el sistema a una casilla de correo dedicada del área de Factoring para captura continua de documentos entrantes.

**A.2** Monitorear la casilla de correo de forma automática, incluyendo fuera del horario laboral.

**A.3** Detectar y registrar cada correo entrante que contenga adjuntos financieros.

**A.4** Extraer y registrar todos los archivos adjuntos de cada correo recibido.

**A.5** Registrar metadatos de recepción por correo: remitente, destinatario, asunto, fecha/hora, identificador del mensaje.

**A.6** Soportar recepción de múltiples archivos en un mismo correo como un lote de procesamiento vinculado.

**A.7** Ofrecer un portal web alternativo para carga manual de documentos financieros.

**A.8** Permitir carga de uno o varios archivos por sesión en el portal.

**A.9** Registrar metadatos de recepción por portal: usuario que cargó, fecha/hora, observaciones opcionales.

**A.10** Aceptar documentos en formatos habituales de la operación (PDF nativo, PDF escaneado, imágenes fotografiadas, y otros acordados en Fase 1).

**A.11** Rechazar o marcar como no procesables formatos no soportados, con mensaje claro al usuario o remitente.

**A.12** Generar acuse de recepción automático al remitente cuando el documento ingresa por correo.

**A.13** Personalizar el contenido del acuse automático con tono institucional acordado con el área.

**A.14** Incluir en el acuse identificación del documento recibido y estado inicial del caso.

**A.15** Crear un registro de caso por cada documento o lote recibido, con identificador único trazable.

**A.16** Asignar estado inicial al caso al momento de la recepción (recibido, en cola, etc.).

**A.17** No bloquear el procesamiento del resto del lote cuando un documento individual no sea interpretable.

**A.18** Notificar al remitente cuando un documento no pueda ser interpretado por calidad insuficiente.

**A.19** Dejar el caso en estado pendiente cuando el documento no sea interpretable, sin detener otros casos.

**A.20** Mantener los canales de recepción actuales del área sin exigir cambio de operativa al usuario externo.

**A.21** Permitir recepción simultánea desde correo y portal sin duplicar casos.

**A.22** Detectar posibles duplicados de documento (mismo archivo, mismo remitente, misma ventana temporal) y marcarlos para revisión.

**A.23** Registrar el canal de origen de cada documento (correo / portal / carga manual alternativa).

**A.24** Soportar operación continua 24/7 en la capa de ingesta, independiente del horario del analista.

---

### GRUPO B — Preprocesamiento documental

**B.1** Identificar automáticamente el tipo de documento financiero recibido (balance, estado de resultados, balance de ocho columnas, documento mixto, etc.).

**B.2** Detectar documentos concatenados (varios estados en un solo archivo) y particionarlos en unidades procesables.

**B.3** Corregir orientación de escaneos rotados o invertidos antes de la extracción.

**B.4** Evaluar y registrar la calidad de origen del documento como atributo del caso (nativo, escaneado legible, degradado, ilegible).

**B.5** Registrar cantidad de páginas por documento.

**B.6** Asociar cada página procesada al documento fuente y al caso correspondiente.

**B.7** Detectar documentos incompletos (páginas faltantes, cortes evidentes) y marcarlos para revisión.

**B.8** Normalizar resolución o formato de imagen cuando sea necesario para mejorar la extracción.

**B.9** Preservar el documento original sin alteración en almacenamiento seguro.

**B.10** Generar derivados de preprocesamiento (páginas normalizadas, miniaturas) cuando aplique.

**B.11** Registrar logs de preprocesamiento por documento para diagnóstico.

**B.12** Derivar a revisión humana documentos que no superen el umbral mínimo de calidad acordado en Fase 1.

**B.13** Aplicar política de excepciones para documentos ilegibles: notificación, carga manual alternativa, registro del caso.

**B.14** Permitir reintento de preprocesamiento ante fallas transitorias.

**B.15** Aislar errores de preprocesamiento por documento para no afectar el lote completo.

**B.16** Habilitar modo de carga manual alternativa cuando el documento no supere calidad mínima ni reintentos de extracción.

---

### GRUPO C — Extracción de información financiera

**C.1** Interpretar cada página del documento mediante extracción multimodal de página completa.

**C.2** Tratar de forma equivalente documentos nativos digitales y documentos escaneados o fotografiados.

**C.3** Extraer líneas contables con, como mínimo: denominación, código (si existe), columna del documento, monto y referencia de página.

**C.4** Extraer encabezados, totales parciales y totales generales cuando estén presentes en el documento.

**C.5** Extraer metadatos visibles en el documento: razón social, RUT, período, moneda, escala, fecha de emisión.

**C.6** Estructurar la salida de extracción en formato validable contra un esquema definido.

**C.7** Reprocesar automáticamente el documento cuando la extracción no supere la validación de esquema.

**C.8** Derivar a revisión humana cuando la extracción falle tras los reintentos configurados.

**C.9** Registrar nivel de confianza de extracción por línea o por campo cuando el motor lo provea.

**C.10** Mantener trazabilidad de cada línea extraída hasta página y posición en el documento de origen.

**C.11** Extraer información de balances de ocho columnas respetando la estructura de columnas (sumas, saldos, inventario, resultados).

**C.12** Extraer información de balances clasificados con distinción activo/pasivo/patrimonio cuando el documento lo permita.

**C.13** Extraer estados de resultados con sus rubros de ingresos, costos y gastos.

**C.14** Detectar tablas, notas al pie y anotaciones marginales relevantes para clasificación posterior.

**C.15** Soportar documentos en distintos idiomas o convenciones numéricas habituales en la cartera chilena.

**C.16** Registrar cada intento de extracción y su resultado para auditoría.

**C.17** Permitir sustitución del proveedor de extracción sin cambiar las funcionalidades de negocio expuestas al usuario.

**C.18** Encolar trabajos de extracción de forma asíncrona sin bloquear la interfaz del analista.

**C.19** Reintentar extracción automáticamente ante indisponibilidad transitoria del servicio de modelos.

**C.20** Mantener en cola los casos afectados por indisponibilidad hasta restablecerse el servicio.

**C.21** Procesar estados financieros auditados bajo IFRS con la misma pipeline que balances tributarios y clasificados.

**C.22** Extraer y preservar notas explicativas vinculadas a rubros cuando estén presentes en el documento.

---

### GRUPO D — Normalización de datos financieros

**D.1** Detectar automáticamente la moneda del documento (CLP, USD, UF u otras acordadas).

**D.2** Detectar automáticamente la escala numérica (unidades, miles, millones) del documento.

**D.3** Detectar el período contable al que corresponde el documento (ejercicio, rango de fechas).

**D.4** Detectar o inferir el contribuyente (RUT, razón social) asociado al documento.

**D.5** Convertir todos los montos a una base numérica comparable dentro del caso.

**D.6** Marcar para revisión líneas con escala no declarada en lugar de asumir un valor arbitrario.

**D.7** Aplicar verificación por magnitud cuando la escala no esté explícita en el documento.

**D.8** Normalizar signos numéricos según convención definida por el área.

**D.9** Unificar denominaciones con variaciones ortográficas evidentes sin perder el texto original.

**D.10** Registrar metadatos normalizados del caso: moneda, escala, período, contribuyente detectado.

**D.11** Permitir corrección manual de metadatos normalizados en estación de revisión.

**D.12** Detectar inconsistencias entre metadatos del documento y metadatos del contribuyente registrado.

**D.13** Normalizar fechas y períodos a formatos estándar del sistema.

**D.14** Detectar documentos correspondientes a ejercicios muy anteriores al vigente y marcarlos.

**D.15** Registrar logs de decisiones de normalización automática.

**D.16** Preservar valores originales junto a valores normalizados para trazabilidad.

**D.17** Soportar consolidación posterior de múltiples períodos de una misma empresa en un análisis.

**D.18** Detectar totales de pasivo que incluyan patrimonio en la misma cifra y marcarlos como inconsistencia.

---

### GRUPO E — Plan de cuentas institucional

**E.1** Operar con un único plan de cuentas institucional como modelo de clasificación válido del área.

**E.2** Impedir que una línea quede asignada a un rubro fuera del plan de cuentas institucional.

**E.3** Versionar el plan de cuentas institucional cada vez que se modifique.

**E.4** Registrar qué versión del plan de cuentas se aplicó en cada caso procesado.

**E.5** Permitir administración del plan de cuentas por usuario autorizado sin intervención de desarrollo.

**E.6** Incorporar rubros de patrimonio explícitos en el plan de cuentas.

**E.7** Incorporar rubros de pasivo no corriente explícitos en el plan de cuentas.

**E.8** Definir y aplicar corte entre corriente y no corriente por rubro.

**E.9** Definir convención de signo por cuenta en el plan de cuentas.

**E.10** Desambiguar rubros con denominaciones coincidentes mediante reglas explícitas.

**E.11** Formalizar reglas hoy expresadas como notas de margen en documentos de referencia.

**E.12** Asociar cada rubro al estado financiero al que pertenece (activo, pasivo, patrimonio, resultados).

**E.13** Exportar el plan de cuentas vigente en formato utilizable por el área.

**E.14** Importar o cargar una versión inicial del plan de cuentas durante la puesta en marcha.

**E.15** Exigir aprobación formal de una versión del plan de cuentas antes de usarla en producción.

**E.16** Mantener historial de cambios del plan de cuentas con autor, fecha y motivo.

**E.17** Impedir procesamiento de clasificación si no existe plan de cuentas aprobado vigente.

**E.18** Separar explícitamente patrimonio de pasivo en la estructura del plan.

---

### GRUPO F — Clasificación de líneas contables

**F.1** Asignar cada línea normalizada a un rubro del plan de cuentas institucional.

**F.2** Aplicar primero reglas institucionales definidas por el área (patrones de denominación, reglas por código, etc.).

**F.3** Aplicar coincidencia semántica entre denominación de la línea y denominaciones de referencia del plan de cuentas.

**F.4** Tolerar errores de tipeo y variaciones ortográficas en la coincidencia semántica.

**F.5** Usar resolución asistida para líneas que no encuentren correspondencia por reglas o semántica.

**F.6** Restringir toda clasificación asistida a rubros válidos del plan de cuentas institucional.

**F.7** Asignar nivel de confianza de clasificación a cada línea.

**F.8** Marcar líneas con clasificación bajo umbral para revisión humana obligatoria.

**F.9** Detectar clasificaciones del documento de origen inconsistentes con criterio institucional (ej.: retiros de socios en activo).

**F.10** Registrar la clasificación propuesta y la clasificación final aprobada.

**F.11** Permitir reclasificación manual en estación de revisión.

**F.12** Registrar analista, fecha y motivo de cada corrección de clasificación.

**F.13** Aplicar reglas de clasificación versionadas fuera del código de aplicación.

**F.14** Recalcular confianza del caso agregando confianzas por línea según regla configurable.

**F.15** Detectar cuentas con denominaciones ambiguas que mapean a múltiples rubros posibles.

**F.16** Priorizar reglas específicas del contribuyente sobre reglas genéricas cuando existan.

**F.17** Bloquear avance del caso a informe si existen líneas sin clasificar.

**F.18** Soportar reclasificación masiva de líneas similares dentro de un mismo caso.

**F.19** Registrar cada decisión automática de clasificación en auditoría.

**F.20** Permitir prueba de clasificación sobre documentos de ejemplo sin afectar producción.

**F.21** Detectar específicamente cuentas de retiro de socios clasificadas erróneamente dentro del activo.

**F.22** Incorporar correcciones aprobadas al diccionario de patrones institucional cuando el área autorice generalización.

---

### GRUPO G — Memoria de criterios por contribuyente

**G.1** Registrar cada corrección de clasificación aprobada por el analista como criterio para ese contribuyente.

**G.2** Asociar criterio aprobado a: contribuyente, denominación de origen, rubro institucional destino.

**G.3** Aplicar automáticamente criterios aprobados en presentaciones futuras del mismo contribuyente.

**G.4** Permitir criterios específicos por contribuyente que difieran de reglas genéricas del área.

**G.5** Registrar analista y fecha de aprobación de cada criterio.

**G.6** Permitir consulta del historial de criterios por contribuyente.

**G.7** Permitir desactivar o modificar un criterio aprobado con versionado.

**G.8** Medir reducción de líneas a revisar entre primera y segunda presentación de un mismo contribuyente.

**G.9** No aplicar criterios de un contribuyente a otro distinto salvo regla explícita de generalización aprobada.

**G.10** Alimentar el motor de clasificación con criterios aprobados como fuente prioritaria.

**G.11** Actualizar la base de conocimiento del sistema con cada corrección validada por el analista.

**G.12** Permitir consultar qué criterios se aplicaron automáticamente en un caso dado.

---

### GRUPO H — Validación contable y control de calidad

**H.1** Verificar cuadratura contable: activo = pasivo + patrimonio en balance.

**H.2** Verificar coherencia entre estados del mismo documento (balance vs. estado de resultados).

**H.3** Verificar integridad de agrupaciones y subtotales.

**H.4** Detectar inconsistencias de clasificación que distorsionen indicadores (activo sobrevalorado, patrimonio mal ubicado).

**H.5** Detectar escalas expresadas en miles sin declararse explícitamente.

**H.6** Detectar errores de tipeo en denominaciones que afecten clasificación.

**H.7** Detectar estados financieros de ejercicios desactualizados respecto al vigente.

**H.8** Asignar semáforo al caso según resultado de validaciones (aprobado, con observaciones, requiere revisión).

**H.9** Impedir avance a informe de casos que no superen validación de cuadratura.

**H.10** Registrar resultado de cada regla de validación aplicada.

**H.11** Listar todas las inconsistencias detectadas con referencia a líneas y documento de origen.

**H.12** Diferenciar inconsistencias del documento de origen vs. inconsistencias introducidas por el sistema.

**H.13** Permitir al analista confirmar o rechazar inconsistencias detectadas.

**H.14** Recalcular validaciones tras correcciones en estación de revisión.

**H.15** Exigir resolución de inconsistencias críticas antes de aprobar la ficha.

**H.16** Verificar que débitos igualen créditos cuando el documento lo permita (balance de ocho columnas).

**H.17** Validar que totales parciales cuadren con líneas componentes.

**H.18** Generar reporte de validación exportable por caso.

**H.19** Cuantificar y alertar porcentaje de activo potencialmente mal clasificado en el documento de origen.

**H.20** Registrar nivel de confianza por línea como insumo del semáforo del caso.

---

### GRUPO I — Umbral de confianza y revisión por excepción

**I.1** Operar con umbral de confianza configurable a nivel de sistema.

**I.2** Establecer valor inicial del umbral en 85%.

**I.3** Permitir modificación del umbral por administrador sin despliegue de código.

**I.4** Aplicar el umbral configurable al procesamiento siguiente tras cada cambio.

**I.5** Derivar obligatoriamente a revisión humana toda línea bajo el umbral.

**I.6** Derivar obligatoriamente a revisión humana todo caso cuyo agregado de confianza esté bajo umbral.

**I.7** Permitir avance automático de líneas y casos que superen el umbral sin intervención humana.

**I.8** Calcular confianza a nivel de línea, sección y caso.

**I.9** Mostrar visualmente qué líneas requieren revisión y cuáles no.

**I.10** Impedir generación de informe final de casos con líneas pendientes de revisión bajo umbral.

**I.11** Registrar en auditoría cada derivación a revisión humana y su motivo (confianza, validación, calidad).

**I.12** Permitir calibración del umbral durante UAT con base en resultados observados.

**I.13** Reportar mensualmente proporción de casos resueltos sin intervención humana.

**I.14** Mostrar tendencia de mejora en resolución automática conforme crece la memoria de criterios.

---

### GRUPO J — Estación de revisión humana

**J.1** Presentar al analista únicamente las líneas marcadas para revisión, no el documento completo línea por línea.

**J.2** Mostrar documento de origen y ficha estructurada lado a lado.

**J.3** Resaltar en el documento la página y línea de origen de cada ítem en revisión.

**J.4** Permitir navegar entre páginas del documento de origen desde la estación de revisión.

**J.5** Permitir corregir denominación, monto, rubro asignado y metadatos de una línea.

**J.6** Permitir aprobar la clasificación propuesta por el sistema con un acción explícita.

**J.7** Permitir rechazar y reclasificar la línea en otro rubro institucional válido.

**J.8** Registrar cada acción del analista como evento de auditoría.

**J.9** Incorporar correcciones aprobadas a la memoria de criterios del contribuyente cuando corresponda.

**J.10** Recalcular validaciones y confianza del caso tras cada corrección.

**J.11** Mostrar semáforo y listado de inconsistencias pendientes durante la revisión.

**J.12** Permitir aprobar la ficha completa una vez resueltas todas las excepciones.

**J.13** Impedir aprobación de ficha con líneas pendientes o cuadratura no verificada.

**J.14** Mostrar historial de versiones de la ficha en revisión.

**J.15** Permitir devolver el caso a reprocesamiento cuando el documento fuente sea incorrecto.

**J.16** Filtrar cola de revisión por analista, contribuyente, fecha, estado y prioridad.

**J.17** Asignar casos en revisión a analistas cuando el área lo requiera.

**J.18** Mostrar tiempo en cola y tiempo total de procesamiento del caso.

**J.19** Soportar revisión concurrente sin pérdida de datos (bloqueo optimista o equivalente funcional).

**J.20** Permitir agregar observaciones del analista al caso antes de aprobar.

**J.21** Permitir ingreso manual de líneas contables cuando la extracción automática no fue posible (carga manual alternativa).

**J.22** Completar en la interfaz los apartados variables del informe de comité que requieren criterio del analista.

**J.23** Resolver en revisión únicamente las líneas señaladas, dejando avanzar automáticamente el resto del caso.

**J.24** Registrar intervención humana focalizada en informe (apartados propios del caso) sin re-transcribir todo el documento.

---

### GRUPO K — Ficha canónica financiera

**K.1** Generar una ficha canónica estructurada por cada caso aprobado.

**K.2** Expresar balance clasificado bajo el plan de cuentas institucional.

**K.3** Expresar estado de resultados bajo el plan de cuentas institucional.

**K.4** Independizar la ficha del formato del documento de origen.

**K.5** Registrar estado de aprobación de la ficha (borrador, en revisión, aprobada, rechazada).

**K.6** Registrar resultado de cada validación aplicada sobre la ficha.

**K.7** Mantener versiones sucesivas de la ficha cuando haya correcciones.

**K.8** Permitir consulta de ficha aprobada en cualquier momento posterior.

**K.9** Exportar ficha en formatos acordados (PDF, Excel, JSON u otros definidos en Fase 1).

**K.10** Vincular cada cifra de la ficha a su línea, página y documento de origen.

**K.11** Separar explícitamente activo corriente, activo no corriente, pasivo corriente, pasivo no corriente y patrimonio.

**K.12** Aplicar convención de signo institucional en la ficha (ej.: patrimonio negativo en retiros).

**K.13** Consolidar múltiples documentos de un mismo contribuyente y período en una ficha cuando corresponda.

**K.14** Marcar fichas con observaciones del analista visibles en consultas posteriores.

**K.15** Impedir edición de ficha aprobada sin generar nueva versión auditada.

---

### GRUPO L — Motor de indicadores financieros

**L.1** Calcular indicadores sobre la ficha aprobada usando fórmulas configurables por el área.

**L.2** Soportar indicadores de liquidez definidos por el área.

**L.3** Soportar indicadores de endeudamiento definidos por el área.

**L.4** Soportar indicadores de rentabilidad definidos por el área.

**L.5** Soportar indicadores de capital de trabajo definidos por el área.

**L.6** Soportar indicadores de comportamiento frente a operaciones de factoring definidos por el área.

**L.7** Versionar fórmulas de indicadores fuera del código de aplicación.

**L.8** Registrar qué versión de cada fórmula se usó en el cálculo de un caso.

**L.9** Permitir administración de fórmulas por usuario autorizado sin despliegue.

**L.10** Registrar qué líneas de la ficha participan en el cálculo de cada indicador.

**L.11** Recalcular indicadores automáticamente tras correcciones en la ficha.

**L.12** Mostrar indicadores calculados en la estación de revisión antes de generar informe.

**L.13** Detectar indicadores no calculables por falta de rubros requeridos y reportarlo.

**L.14** Exportar detalle de cálculo de indicadores para auditoría.

**L.15** Impedir generación de informe si indicadores obligatorios no pudieron calcularse.

---

### GRUPO M — Generación de informe de comité

**M.1** Generar informe de comité sobre la plantilla institucional vigente del área.

**M.2** Resolver automáticamente apartados estandarizados del informe con datos de la ficha e indicadores.

**M.3** Dejar apartados propios del caso listos para completar manualmente por el analista.

**M.4** Incluir en el informe las cifras con trazabilidad verificable al documento de origen.

**M.5** Incluir indicadores calculados en las secciones correspondientes de la plantilla.

**M.6** Registrar inconsistencias detectadas y confirmadas como sección del informe cuando aplique.

**M.7** Versionar plantillas de informe fuera del código.

**M.8** Permitir administración de plantillas por usuario autorizado.

**M.9** Exigir plantilla institucional aprobada antes de generar informes en producción.

**M.10** Exportar informe en formatos acordados (Word, PDF u otros definidos en Fase 1).

**M.11** Registrar fecha, analista y versión de ficha usada en cada informe generado.

**M.12** Regenerar informe cuando la ficha subyacente cambie de versión.

**M.13** Marcar informes preliminares vs. informes finales aprobados.

**M.14** Impedir informe final de casos no aprobados.

**M.15** Incluir metadatos del contribuyente, período y fuente documental en el informe.

**M.16** Diferenciar y administrar secciones fijas vs. secciones variables de la plantilla del informe.

**M.17** Guardar borrador del informe con apartados manuales incompletos.

**M.18** Marcar informe como final solo cuando apartados obligatorios (automáticos y manuales) estén completos.

**M.19** Generar informe sobre planilla institucional vigente del comité, respetando estructura estandarizada acordada.

---

### GRUPO N — Repositorio financiero consolidado

**N.1** Persistir cada ficha aprobada en un repositorio central por contribuyente.

**N.2** Mantener historial de fichas por contribuyente ordenado por período.

**N.3** Permitir consulta de todos los casos procesados de un contribuyente.

**N.4** Permitir comparar ejercicios de un mismo contribuyente.

**N.5** Permitir comparar contribuyentes distintos bajo el mismo plan de cuentas.

**N.6** Detectar deterioros entre presentaciones sucesivas de un contribuyente.

**N.7** Buscar casos por RUT, razón social, período, estado, analista o fecha.

**N.8** Filtrar repositorio por rango de fechas, estado de caso y canal de recepción.

**N.9** Exportar listados del repositorio para análisis externo.

**N.10** Vincular cada entrada del repositorio al documento fuente original.

**N.11** Mostrar línea de tiempo de presentaciones por contribuyente.

**N.12** Consolidar múltiples empresas relacionadas cuando el área lo requiera en un análisis.

**N.13** Soportar consulta de criterios de clasificación históricos por contribuyente.

**N.14** No incluir en el repositorio productivo casos rechazados o no aprobados, salvo configuración explícita de retención.

**N.15** Consolidar en una vista analítica múltiples empresas y múltiples períodos (ej.: 3 empresas × 2 años = 6 periodos).

**N.16** Unir fichas de empresas relacionadas para análisis de grupo sin perder trazabilidad individual.

**N.17** Habilitar comparación de cartera: casos comparables entre sí y en el tiempo bajo mismo plan de cuentas.

---

### GRUPO O — Orquestación y procesamiento asíncrono

**O.1** Encolar cada caso recibido para procesamiento en segundo plano.

**O.2** Ejecutar pipeline completo (preproceso → extracción → normalización → clasificación → validación) de forma automática.

**O.3** Procesar múltiples casos en paralelo.

**O.4** Procesar múltiples empresas y períodos simultáneamente.

**O.5** Permitir que el analista continúe operando mientras el sistema procesa en background.

**O.6** Aislar fallas por documento para que un caso defectuoso no detenga el lote.

**O.7** Reintentar automáticamente etapas fallidas por errores transitorios.

**O.8** Configurar número máximo de reintentos por etapa.

**O.9** Registrar estado de avance del pipeline por caso (etapa actual, porcentaje, timestamps).

**O.10** Notificar al analista cuando un caso pase a revisión humana o quede aprobado automáticamente.

**O.11** Permitir pausar y reanudar procesamiento de un caso manualmente por administrador.

**O.12** Priorizar casos en cola según reglas configurables (fecha, urgencia, contribuyente).

**O.13** Desplegar workers de procesamiento en nodo o servidor independiente de la API interactiva.

**O.14** Escalar cantidad de workers sin cambiar funcionalidades expuestas al usuario.

**O.15** Mantener cola persistente ante reinicios del sistema.

**O.16** Re-ejecutar clasificación y validación sin repetir extracción cuando cambien reglas o criterios.

**O.17** Re-calcular indicadores e informe sin repetir pipeline completo cuando la ficha ya esté aprobada y solo cambien fórmulas o plantilla.

**O.18** Evitar que el analista deba esperar fin de un caso para iniciar procesamiento de otro (cola continua).

**O.19** Registrar logs diagnósticos cuando una etapa no pueda estandarizar el documento, indicando causa y acción sugerida.

---

### GRUPO P — Trazabilidad y auditoría

**P.1** Registrar para cada cifra del informe: documento, página y línea de origen.

**P.2** Registrar cada decisión automática del sistema (clasificación, normalización, validación).

**P.3** Registrar cada corrección humana con identidad del analista y timestamp.

**P.4** Registrar versión del plan de cuentas aplicada en cada evento.

**P.5** Registrar versión de fórmulas de indicadores aplicada en cada cálculo.

**P.6** Registrar versión de plantilla de informe usada en cada generación.

**P.7** Mantener registro de auditoría inmutable o con controles de integridad.

**P.8** Permitir consulta de auditoría por caso, contribuyente, analista y rango de fechas.

**P.9** Exportar trazabilidad completa de un caso para revisión posterior de comité.

**P.10** Recuperar documento original desde cualquier cifra del informe o la ficha.

**P.11** Registrar eventos de recepción, procesamiento, revisión, aprobación e informe.

**P.12** Registrar cambios de configuración (umbral, plan de cuentas, fórmulas, plantillas).

**P.13** Cumplir objetivo de 100% de trazabilidad en casos aprobados.

**P.14** Asociar cada evento de auditoría al identificador único del caso.

---

### GRUPO Q — Portal web, carga y experiencia de usuario

**Q.1** Proveer interfaz web accesible para analistas, administradores y usuarios de carga.

**Q.2** Implementar portal de carga con flujo simple para usuarios no técnicos.

**Q.3** Mostrar estado del caso en tiempo real (recibido, procesando, en revisión, aprobado, error).

**Q.4** Listar casos pendientes de acción del analista.

**Q.5** Listar casos procesados recientemente.

**Q.6** Permitir búsqueda global de casos y contribuyentes.

**Q.7** Mostrar dashboard operativo con volumen de casos, tiempos y excepciones.

**Q.8** Adaptar interfaz para visualización de documentos PDF e imágenes en el navegador.

**Q.9** Soportar navegadores modernos acordados en Fase 1.

**Q.10** Mostrar mensajes de error comprensibles para usuarios de negocio.

**Q.11** No exigir al usuario externo crear cuenta para enviar documentos por correo.

**Q.12** Permitir autenticación de usuarios internos del área.

**Q.13** Mantener experiencia no invasiva: misma operativa de recepción, menor fricción en revisión.

**Q.14** Mostrar progreso de procesamiento en background al analista.

**Q.15** Permitir descarga de informes y fichas desde la interfaz.

---

### GRUPO R — Administración y configuración del sistema

**R.1** Administrar usuarios internos y sus roles.

**R.2** Administrar umbral de confianza global.

**R.3** Administrar plan de cuentas institucional (CRUD con versionado).

**R.4** Administrar reglas de clasificación institucionales.

**R.5** Administrar fórmulas de indicadores.

**R.6** Administrar plantillas de informe de comité.

**R.7** Administrar parámetros de reintentos y timeouts de procesamiento.

**R.8** Administrar configuración de casilla de correo de ingesta.

**R.9** Administrar textos de acuse automático y notificaciones.

**R.10** Administrar política de excepciones para documentos ilegibles.

**R.11** Consultar logs operativos del sistema por administrador.

**R.12** Consultar estado de colas de procesamiento.

**R.13** Forzar reprocesamiento de un caso por administrador.

**R.14** Configurar retención de documentos y fichas según política acordada.

**R.15** Gestionar ambientes (desarrollo, QA, producción) con configuraciones separadas.

**R.16** Exportar e importar configuraciones versionadas (plan de cuentas, reglas, fórmulas).

**R.17** Registrar responsable institucional del plan de cuentas dentro del área.

---

### GRUPO S — Seguridad, acceso y tratamiento de datos

**S.1** Autenticar a todo usuario interno antes de acceder a funcionalidades del sistema.

**S.2** Autorizar acciones según rol (analista, administrador, referente, solo lectura).

**S.3** Restringir administración de configuraciones críticas a roles autorizados.

**S.4** Cifrar comunicaciones entre cliente y servidor.

**S.5** Almacenar documentos financieros de terceros en repositorio seguro.

**S.6** Registrar accesos a documentos y fichas sensibles.

**S.7** Permitir despliegue en nube o infraestructura propia según marco de tratamiento de datos definido en Fase 1.

**S.8** No exponer información de un contribuyente a usuarios no autorizados.

**S.9** Permitir eliminación o anonimización según política de retención acordada.

**S.10** Condicionar Go-Live a no registrar hallazgos de severidad alta o crítica en pruebas de seguridad.

**S.11** Separar credenciales de casilla de correo y servicios externos del código de aplicación.

**S.12** Auditar intentos de acceso fallidos.

---

### GRUPO T — Notificaciones y comunicaciones

**T.1** Enviar acuse de recepción automático por correo al remitente externo.

**T.2** Notificar al remitente cuando un documento no pueda procesarse por calidad insuficiente.

**T.3** Notificar al analista cuando un caso requiera revisión.

**T.4** Notificar al analista cuando un caso haya sido aprobado automáticamente.

**T.5** Notificar errores críticos de procesamiento al administrador del sistema.

**T.6** Permitir configurar destinatarios de notificaciones operativas.

**T.7** Registrar envío y entrega de notificaciones relevantes.

**T.8** Usar tono configurable en comunicaciones automáticas hacia remitentes externos.

---

### GRUPO U — Métricas, KPIs y reportes operativos

**U.1** Medir tiempo de proceso por caso desde recepción hasta aprobación de ficha.

**U.2** Reportar reducción de tiempo respecto al rango actual de 1–6 horas hacia meta de 20–30 minutos.

**U.3** Medir porcentaje de casos aprobados con cuadratura verificada (objetivo 100%).

**U.4** Medir porcentaje de cifras con trazabilidad completa (objetivo 100% en aprobados).

**U.5** Medir proporción de casos resueltos sin intervención humana (sobre umbral 85%).

**U.6** Medir efecto de memoria de criterios (líneas a revisar 1ra vs. 2da presentación).

**U.7** Contabilizar inconsistencias detectadas en documento de origen y confirmadas por analista.

**U.8** Medir cobertura de procesamiento (% documentos interpretados sin carga manual alternativa).

**U.9** Presentar KPIs en panel administrativo.

**U.10** Exportar reportes de KPIs por período.

**U.11** Medir volumen de casos por canal (correo vs. portal).

**U.12** Medir tasa de error por etapa del pipeline.

---

### GRUPO V — Integración con operación de ECR Salud

**V.1** Integrar con casilla de correo productiva del área de Factoring.

**V.2** Operar sin modificar los canales comerciales que usan ejecutivos para recibir documentos.

**V.3** Recibir definiciones del área: plan de cuentas, indicadores, plantilla de informe, casos reales de prueba.

**V.4** Soportar participación del referente de usuario en validación funcional continua.

**V.5** Entregar demos de avance al cierre de cada bloque significativo de trabajo.

**V.6** Soportar ciclo UAT con casos reales provistos por ECR Salud.

**V.7** Permitir calibración de umbral durante UAT.

**V.8** Entregar manuales de usuario y administrador.

**V.9** Realizar capacitación a analistas y administrador del sistema.

**V.10** Acompañar Hypercare diario durante las primeras dos semanas post Go-Live.

**V.11** Traspasar operación al modelo de soporte mensual post cierre.

**V.12** Gestionar cambios de alcance futuros mediante mecanismo formal de Control de Cambio (CR).

---

### GRUPO W — Entidades de negocio que el sistema debe gestionar

Estas no son funcionalidades de interfaz, sino **objetos de negocio** que el sistema debe crear, mantener y relacionar:

**W.1** Contribuyente: RUT, razón social, denominaciones alternativas, criterios históricos.

**W.2** Documento fuente: tipo, canal, fecha recepción, remitente, calidad, páginas, moneda, escala, período.

**W.3** Línea contable: código origen, denominación, columna, monto, página, línea, rubro asignado, confianza.

**W.4** Rubro institucional: estado, corriente/no corriente, signo, versión de criterio.

**W.5** Ficha canónica: balance + resultados en modelo institucional, estado aprobación, validaciones.

**W.6** Indicador: nombre, fórmula, versión, valor calculado, líneas participantes.

**W.7** Criterio aprobado: mapeo origen → rubro por contribuyente, analista, fecha.

**W.8** Registro de auditoría: decisiones, correcciones, versiones, timestamps.

**W.9** Caso de procesamiento: agrupación de documentos, estados, responsable, tiempos.

**W.10** Informe de comité: versión, plantilla usada, estado preliminar/final, analista emisor.

---

### GRUPO X — Reglas de negocio transversales

**X.1** Ningún caso avanza a informe sin cuadratura verificada.

**X.2** Ninguna línea queda sin rubro institucional válido en ficha aprobada.

**X.3** Toda corrección humana queda registrada antes de aprobar.

**X.4** Toda versión de plan de cuentas usada en producción requiere aprobación formal previa.

**X.5** El umbral de confianza es configurable sin redeploy.

**X.6** El sistema aprende por contribuyente, no generaliza criterios sin aprobación.

**X.7** La operación de ingesta no se detiene por falla aislada de un documento.

**X.8** El analista solo revisa excepciones, no transcribe el documento completo.

**X.9** Cada evaluación emitida debe poder auditarse contra criterios vigentes al momento de emisión.

**X.10** El FFA es modelo de datos financiero del área; el documento es solo punto de entrada.

---

### GRUPO Y — Dependencias del cliente que habilitan funcionalidades

Estas son **condiciones de entrada** que ECR Salud debe cumplir para que las funcionalidades operen; se documentan porque bloquean capacidades concretas:

**Y.1** Entregar plan de cuentas institucional para saneamiento (bloquea clasificación).

**Y.2** Aprobar plan de cuentas saneado (bloquea producción de clasificación).

**Y.3** Entregar definición de indicadores y fórmulas (bloquea motor de indicadores).

**Y.4** Entregar plantilla institucional del informe de comité (bloquea generador de informes).

**Y.5** Entregar casos reales para pruebas en Fase 1 y UAT.

**Y.6** Designar Product Owner, responsable de sistemas y referente de usuario.

**Y.7** Definir marco de tratamiento de información de terceros antes de Fase 2 (bloquea despliegue productivo).

**Y.8** Definir política de excepciones para documentos ilegibles en Fase 1.

**Y.9** Proveer acceso a casilla de correo productiva para integración.

**Y.10** Participar en aprobaciones formales de entregables por fase.

---

### GRUPO Z — Soporte post Go-Live (servicio, no software)

**Z.1** Gestionar incidentes según niveles P1/P2/P3 definidos en propuesta.

**Z.2** P1: respuesta ≤ 30 min, diagnóstico ≤ 4 h, resolución ≤ 24 h (L-V 09–18).

**Z.3** P2: respuesta ≤ 1 h, diagnóstico ≤ 8 h, resolución ≤ 72 h (L-V 09–18).

**Z.4** P3: respuesta ≤ 8 h, diagnóstico ≤ 24 h, resolución a convenir (L-V 09–18).

**Z.5** Proveer soporte, mantenimiento y evolución en modalidad mensual post implementación.

**Z.6** Cotizar por separado módulos evolutivos (IVA, contravalidación tributaria, integraciones externas).

---

### GRUPO AA — Pipeline operativo de 8 etapas (verificación end-to-end)

Estas funciones verifican que el flujo completo documentado en la propuesta esté implementado de punta a punta:

**AA.1 Etapa Recepción:** entrada por correo o portal → identificación de tipo, orientación y partición → salida: caso registrado y acuse enviado.

**AA.2 Etapa Extracción:** documento identificado → interpretación de página completa y estructuración de líneas → salida: líneas con descripción, código, columna, monto y página de origen.

**AA.3 Etapa Normalización:** líneas crudas → detección de moneda, escala, período y contribuyente → salida: líneas normalizadas y metadatos del caso.

**AA.4 Etapa Clasificación:** líneas normalizadas → asignación al plan de cuentas por reglas, semántica y memoria → salida: líneas clasificadas con nivel de confianza.

**AA.5 Etapa Validación:** líneas clasificadas → cuadratura, coherencia, integridad e inconsistencias → salida: semáforo del caso y líneas marcadas para revisión.

**AA.6 Etapa Revisión:** caso con excepciones → resolución dirigida con documento a la vista → salida: ficha aprobada y criterios incorporados a memoria.

**AA.7 Etapa Análisis:** ficha aprobada → cálculo de indicadores sobre fórmulas configurables → salida: ficha con indicadores calculados.

**AA.8 Etapa Informe:** ficha con indicadores → generación sobre plantilla institucional → salida: informe listo para completar apartados del caso.

---

### GRUPO AB — Gestión de contribuyentes

**AB.1** Registrar contribuyente con RUT, razón social y metadatos básicos.

**AB.2** Mantener denominaciones alternativas por contribuyente (nombres comerciales, variantes en documentos).

**AB.3** Vincular automáticamente documentos entrantes a contribuyente existente por RUT u otro identificador acordado.

**AB.4** Permitir asociación manual documento–contribuyente cuando la detección automática falle.

**AB.5** Detectar y fusionar registros duplicados de contribuyente.

**AB.6** Consultar perfil completo del contribuyente: historial de casos, criterios, fichas e informes.

**AB.7** Buscar contribuyentes por RUT, razón social o denominación alternativa.

---

### GRUPO AC — Ciclo de vida y estados del caso

**AC.1** Gestionar estados del caso: recibido, en cola, preprocesando, extrayendo, normalizando, clasificando, validando, en revisión, aprobado, informe generado, rechazado, error, pendiente por calidad.

**AC.2** Registrar timestamp de entrada y salida de cada estado.

**AC.3** Impedir transiciones de estado inválidas (ej.: informe final sin ficha aprobada).

**AC.4** Permitir rechazar un caso con motivo documentado.

**AC.5** Permitir cancelar un caso en curso por administrador o analista autorizado.

**AC.6** Permitir reabrir un caso rechazado para reprocesamiento.

**AC.7** Mostrar historial de cambios de estado visible para analista y auditor.

**AC.8** Vincular múltiples documentos de un mismo lote a un caso o a casos relacionados según regla de negocio.

---

### GRUPO AD — Principios funcionales del FFA (FFA NO ES / FFA SÍ ES)

Verificables como comportamiento del producto:

**AD.1** El sistema NO debe limitarse a OCR de caracteres; DEBE producir ficha financiera estructurada bajo modelo institucional único y comparable.

**AD.2** El sistema NO debe reemplazar el criterio del analista de riesgo; DEBE concentrar su intervención solo donde hay excepciones.

**AD.3** El sistema NO debe prometer exactitud ciega sobre documentos degradados; DEBE exigir verificaciones contables antes de avanzar cada caso.

**AD.4** El sistema NO debe imponer cambio de canales de recepción; DEBE operar sobre correo y portal existentes o equivalentes acordados.

**AD.5** El sistema DEBE ser modular: sustituir motor de extracción sin invalidar criterios contables ni clasificaciones ya aprobadas.

**AD.6** El sistema DEBE ser auditable: toda evaluación emitida revisable contra criterios vigentes al momento de emisión.

---

### GRUPO AE — Aprobaciones formales y gobernanza in-system

**AE.1** Registrar workflow de aprobación formal de versiones del plan de cuentas antes de uso productivo.

**AE.2** Registrar workflow de aprobación de plantilla de informe antes de generación productiva.

**AE.3** Registrar workflow de aprobación de catálogo de indicadores y fórmulas.

**AE.4** Impedir uso en producción de configuraciones en estado borrador no aprobado.

**AE.5** Registrar aprobador, fecha y comentarios en cada acta de aprobación in-system.

**AE.6** Consultar configuración vigente vs. configuración histórica aplicada a un caso pasado.

---

### GRUPO AF — Capacitación y operación (verificables en Go-Live)

Funciones que deben demostrarse en capacitación/UAT, además del código:

**AF.1** Demostrar administración del plan de cuentas por administrador capacitado.

**AF.2** Demostrar ajuste de umbral de confianza por administrador capacitado.

**AF.3** Demostrar administración de fórmulas de indicadores sin intervención de desarrollo.

**AF.4** Demostrar flujo completo analista: cola de revisión → aprobación → informe en ≤ 30 min de intervención en casos tipo UAT.

---

## 10. Resumen cuantitativo de funcionalidades

| Grupo | Tema | Cantidad | ¿Código? |
|-------|------|----------|----------|
| A | Recepción e ingesta documental | 24 | Sí |
| B | Preprocesamiento documental | 16 | Sí |
| C | Extracción de información financiera | 22 | Sí |
| D | Normalización de datos financieros | 18 | Sí |
| E | Plan de cuentas institucional | 18 | Sí |
| F | Clasificación de líneas contables | 22 | Sí |
| G | Memoria de criterios por contribuyente | 12 | Sí |
| H | Validación contable y control de calidad | 20 | Sí |
| I | Umbral de confianza y revisión por excepción | 14 | Sí |
| J | Estación de revisión humana | 24 | Sí |
| K | Ficha canónica financiera | 15 | Sí |
| L | Motor de indicadores financieros | 15 | Sí |
| M | Generación de informe de comité | 19 | Sí |
| N | Repositorio financiero consolidado | 17 | Sí |
| O | Orquestación y procesamiento asíncrono | 19 | Sí |
| P | Trazabilidad y auditoría | 14 | Sí |
| Q | Portal web, carga y experiencia de usuario | 15 | Sí |
| R | Administración y configuración del sistema | 17 | Sí |
| S | Seguridad, acceso y tratamiento de datos | 12 | Sí |
| T | Notificaciones y comunicaciones | 8 | Sí |
| U | Métricas, KPIs y reportes operativos | 12 | Sí |
| V | Integración con operación de ECR Salud | 12 | Servicio |
| W | Entidades de negocio gestionadas | 10 | Sí |
| X | Reglas de negocio transversales | 10 | Sí |
| Y | Dependencias del cliente | 10 | Cliente |
| Z | Soporte post Go-Live | 6 | Servicio |
| AA | Pipeline operativo 8 etapas (E2E) | 8 | Sí |
| AB | Gestión de contribuyentes | 7 | Sí |
| AC | Ciclo de vida y estados del caso | 8 | Sí |
| AD | Principios funcionales FFA | 6 | Sí |
| AE | Aprobaciones formales in-system | 6 | Sí |
| AF | Verificación en capacitación/UAT | 4 | Servicio |
| **TOTAL** | | **440 ítems** | **408 de software** |

**Conteo para “¿está hecho todo el sistema?”:** marcar **Hecho** en los **408 ítems de software** (grupos A–X excepto Y, más AA–AE; AA ya incluye las 8 verificaciones E2E) + resolver dependencias **Y** + completar **V**, **AF** y **Z** en Go-Live/soporte + cumplir criterios sección **11**.

---

## 11. Criterios de aceptación globales del proyecto

El proyecto se considerará funcionalmente completo cuando:

1. Un documento recibido por correo o portal recorra el pipeline completo hasta informe de comité con intervención humana solo en excepciones.
2. El tiempo de proceso por caso en operación real se acerque a la meta de 20–30 minutos de intervención del analista.
3. El 100% de los casos aprobados tengan cuadratura verificada y trazabilidad completa.
4. El plan de cuentas institucional opere como modelo único versionado.
5. El umbral de confianza sea configurable y se aplique en el procesamiento siguiente.
6. La memoria de criterios reduzca revisiones en presentaciones repetidas del mismo contribuyente.
7. El repositorio permita consultar y comparar historial por contribuyente.
8. Las configuraciones críticas (plan de cuentas, umbral, fórmulas, plantillas) se administren sin despliegue de código.
9. El sistema opere de forma no invasiva sobre los canales actuales del área.
10. Se complete UAT con acta firmada, capacitación entregada y Go-Live con Hypercare.

---

## 12. Referencia de insumos originales

| Insumo | Ubicación |
|--------|-----------|
| Propuesta FFA ECR Salud | `insumos/2026-09-09 [ECR Salud] - Ficha Financiera Automatizada...docx` |
| Distribución HS/ROL | `insumos/Distribucion_HS_ROL_FFA_ECR_Salud.xlsx` |
| Reunión validación Factoring | `insumos/Reunion validacion - Factoring - 2026_08_26...docx` |
| Digest estructurado | `insumos/_digest.json` |

---

## 13. Matriz de trazabilidad insumo → catálogo

Cada bloque de los insumos originales está cubierto por estos grupos:

| Fuente (insumo) | Temas cubiertos | Grupos del catálogo |
|-----------------|-----------------|---------------------|
| Propuesta § Alcance y objetivos | Recepción, normalización, clasificación, validación | A, D, F, H, I |
| Propuesta § 10 componentes arquitectura | Ingesta → informe, repositorio, orquestación | A–P, O, AA |
| Propuesta § 8 etapas operativas | Pipeline E2E | AA.1–AA.8, AC |
| Propuesta § Plan de cuentas | Modelo único versionado | E, AE, W.4 |
| Propuesta § Umbral 85% | Revisión por excepción | I, AD.2 |
| Propuesta § KPIs | Métricas operativas | U |
| Propuesta § Entidades | Modelo de negocio | W |
| Propuesta § Fuera de alcance | Exclusiones | §7 (no catalogar como pendientes) |
| Propuesta § Riesgos y dependencias | Bloqueantes cliente | Y |
| Propuesta § Fases 1–5 | UAT, Go-Live, capacitación | V, AF, Z |
| Propuesta § FFA NO ES / SÍ ES | Naturaleza del producto | AD |
| Reunión § Umbral 85% acordado | Configurable, validación humana | I.1–I.6 |
| Reunión § Plan cuentas único | Modelo de datos | E, X.4 |
| Reunión § Módulos recepción–revisión | 7 módulos + motores | A–J, AA |
| Reunión § Aprendizaje por contribuyente | Memoria y diccionario | G, F.22 |
| Reunión § Errores muestra (23% activo, retiros socios) | Detectores | F.21, H.19 |
| Reunión § 1–6 h → 20–30 min | Eficiencia, async | O, U.1–U.2, AF.4 |
| Reunión § Consolidación multi-empresa | 6 periodos, paralelo | N.15–N.16, O.3–O.4 |
| Reunión § Correo nocturno + acuse humano | Ingesta 24/7, tono | A.2, A.12–A.13, T.8 |
| Reunión § Carga manual alternativa | Excepciones calidad | B.16, J.21 |
| Reunión § PO, referente, gobernanza | Roles | §8, S.2, Y.6 |
| Excel HS/ROL | Solo planificación equipo | No genera funciones de producto |

---

## 14. Revisión de completitud v1.1 — Hallazgos incorporados

Segunda pasada contra insumos. Se detectaron huecos y se agregaron **99 ítems** (341 → 440):

| Hueco detectado | Ítems agregados |
|-----------------|-----------------|
| Pipeline 8 etapas no explícito como checklist E2E | Grupo **AA** (8) |
| Gestión de contribuyente dispersa | Grupo **AB** (7) |
| Estados del caso no enumerados | Grupo **AC** (8) |
| Principios FFA NO ES / SÍ ES no verificables | Grupo **AD** (6) |
| Aprobaciones formales in-system | Grupo **AE** (6) |
| Demostraciones UAT/capacitación | Grupo **AF** (4) |
| IFRS, notas explicativas | C.21–C.22 |
| Retiros socios, % activo erróneo | F.21, H.19 |
| Base de conocimiento / diccionario | G.11–G.12, F.22 |
| Carga manual alternativa | B.16, J.21 |
| Completar informe manual en UI | J.22, J.24, M.16–M.19 |
| Consolidación multi-empresa multi-período | N.15–N.17 |
| Re-procesar sin re-extraer | O.16–O.19 |
| Logs cuando falla estandarización | O.19 |

**Cobertura declarada:** todos los módulos, etapas, entidades, KPIs, decisiones de reunión y exclusiones de la propuesta están mapeados. Ningún componente de la Tabla 7 (10 componentes) queda sin funciones asociadas en grupos A–P y AA.

---

*Documento v1.1 — Catálogo de completitud funcional FFA. Stack adoptado: Vue 3, Node.js, MongoDB, Redis/BullMQ, almacenamiento S3-compatible, contenedores Docker.*
