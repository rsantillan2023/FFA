const METADATA_RULES = `METADATOS (obligatorio leer del encabezado del PDF/imagen, tal como está impreso):

- razonSocial: nombre legal completo de la empresa (ej. "Transportes del Sur SpA"), NO uses placeholders ni ejemplos genéricos.

- rut: RUT chileno con dígito verificador (ej. "76.123.456-7").

- moneda: código ISO (CLP, USD, UF…).

- escala: unidades | miles | millones | indeterminada (según indique el documento, ej. "expresado en miles de pesos").

- periodo.ejercicio: número entero con el año del balance (ej. 2024). Si no está claro, omití el campo; no uses texto como "indeterminado".

Si un dato no aparece en el documento, omítelo (null) — no lo inventes.`;



const FINYX_POLICY = `POLÍTICA FINYX — EXTRACCIÓN PARA FICHA FINANCIERA CANÓNICA:



PRIORIDAD DE FUENTES (de mayor a menor):

1. ESTADOS FINANCIEROS ESTRUCTURADOS / CANÓNICOS (fuentePrioridad: "canonico"):

   - Estado de Situación Financiera / Balance (seccionPagina: "balance")

   - Estado de Resultados / Resultado Integral (seccionPagina: "resultados")

   - Estado de Flujo de Efectivo (seccionPagina: "flujo_efectivo")

2. Notas y segmentos (fuentePrioridad: "complementario", seccionPagina: "notas" | "segmentos")

3. Resúmenes ejecutivos, portadas, highlights (fuentePrioridad: "resumen", seccionPagina: "resumen_ejecutivo")

4. NO EXTRAER como líneas contables (fuentePrioridad: "operativo"):

   - volúmenes comerciales (toneladas, cemento, unidades vendidas)

   - márgenes o variaciones puramente porcentuales (%)

   - EBITDA u otros indicadores de resumen (salvo que aparezcan como línea del estado de resultados canónico)

   - comentarios narrativos sin monto contable



REGLAS CRÍTICAS:

- NO asumas que las primeras tablas con números son las contables principales. Identificá el título del estado (ej. "Estado de Situación Financiera Consolidado").

- Si un concepto (ej. "Ganancia neta") aparece en portada, resumen, EBITDA y en el Estado de Resultados, extraé UNA sola línea canónica desde el estado estructurado (fuentePrioridad: "canonico").

- En resúmenes/indicadores podés omitir la línea o marcarla fuentePrioridad: "resumen" — NO dupliques la cuenta canónica.

- Para Flujo de Efectivo: extraé actividades operativas, inversión, financiación, variación del efectivo, efectivo inicial y final.

- Cada línea debe indicar seccionPagina y fuentePrioridad.

- estadoFinancieroLinea: activo | pasivo | patrimonio | resultados | flujo (según corresponda).
- confianzaExtraccion: SIEMPRE escala 0.00 a 1.00 (ej. 0.95), nunca 0-100.
- Volúmenes/toneladas/% → indicadoresOperativos[], NO lineas[].
- EBITDA, Deuda Neta, márgenes de resumen → indicadoresFinancieros[], NO lineas[] (salvo línea del estado canónico).
- moneda: código ISO (ARS, CLP, USD). Buscá "millones de pesos", "pesos argentinos", etc.`;



/** Prompts por tipo documental — C.11 balance 8 col, C.12 clasificado, C.13 resultados. */

export function buildExtractPrompt(tipoHint?: string, pageNum?: number, totalPages?: number): string {

  const pageCtx =

    pageNum != null && totalPages != null ? ` Página ${pageNum} de ${totalPages}.` : "";



  const isFirstPage = pageNum == null || pageNum === 1;

  const metadataFocus = isFirstPage

    ? `${METADATA_RULES}\nEn esta primera página, priorizá leer razón social, RUT, moneda, escala y ejercicio del encabezado.\n`

    : "";



  const tipoBlock =

    tipoHint === "balance_8col"

      ? "Documento tipo BALANCE DE OCHO COLUMNAS: respetar columnas sumas, saldos, inventario y resultados."

      : tipoHint === "estado_resultados"

        ? "Documento tipo ESTADO DE RESULTADOS: extraer ingresos, costos, gastos y utilidad."

        : tipoHint === "balance_clasificado"

          ? "Documento tipo BALANCE CLASIFICADO: distinguir activo, pasivo y patrimonio."

          : "Documento financiero chileno o IFRS (balance, resultados, flujo de efectivo).";



  return `${tipoBlock}${pageCtx}

${FINYX_POLICY}

${metadataFocus}Extrae líneas contables con montos numéricos Y transcribe todo el texto visible del documento.



Responde SOLO JSON válido:

{

  "tipoDocumento": "balance_clasificado|balance_8col|estado_resultados|flujo_efectivo|mixto|desconocido",

  "seccionPagina": "balance|resultados|flujo_efectivo|notas|segmentos|resumen_ejecutivo|operativo|otro",

  "metadata": { "razonSocial", "rut", "moneda", "escala": "unidades|miles|millones|indeterminada", "periodo": { "ejercicio", "desde", "hasta" } },

  "textoPagina": "transcripción literal de TODO lo visible: encabezados, tablas, notas al pie, aclaraciones, firmas, pies de página. Usá saltos de línea.",

  "notas": [{ "rubroRef", "texto" }],

  "lineas": [{

    "denominacionOriginal", "codigoOrigen", "columnaOrigen",

    "montoOriginalTexto": "texto EXACTO del monto como aparece (ej. \"(172.284)\", \"225.233\")",

    "montoOriginal": "número con signo contable (negativo si está entre paréntesis)",

    "paginaNumero", "confianzaExtraccion", "seccionPagina", "fuentePrioridad": "canonico|complementario|resumen|operativo",

    "estadoFinancieroLinea": "activo|pasivo|patrimonio|resultados|flujo",

    "bbox": { "x","y","w","h" }

  }]

}

Incluye paginaNumero=${pageNum ?? 1} en cada línea. bbox opcional en coordenadas relativas 0-1.

No omitas filas de tablas de estados financieros estructurados. Responde ÚNICAMENTE el objeto JSON, sin markdown ni texto adicional.`;

}



/** Prompt reducido — prioriza líneas contables; evita JSON truncado en PDFs densos. */

export function buildExtractPromptCompact(tipoHint?: string, pageNum?: number, totalPages?: number): string {

  const pageCtx =

    pageNum != null && totalPages != null ? ` Página ${pageNum} de ${totalPages}.` : "";



  const isFirstPage = pageNum == null || pageNum === 1;

  const metadataFocus = isFirstPage ? `${METADATA_RULES}\n` : "";



  const tipoBlock =

    tipoHint === "balance_8col"

      ? "Balance de ocho columnas."

      : tipoHint === "estado_resultados"

        ? "Estado de resultados."

        : tipoHint === "balance_clasificado"

          ? "Balance clasificado."

          : "Documento financiero (balance, resultados o flujo de efectivo).";



  return `${tipoBlock}${pageCtx}

${FINYX_POLICY}

${metadataFocus}Extraé TODAS las filas con montos numéricos de ESTADOS FINANCIEROS ESTRUCTURADOS visibles en esta página.

NO extraigas volúmenes comerciales, % ni indicadores operativos como líneas contables.

Si la página es resumen ejecutivo/portada, extraé solo metadatos o líneas con fuentePrioridad "resumen" (evitá duplicar cuentas canónicas).

No incluyas transcripción literal.



Responde SOLO JSON válido:

{

  "tipoDocumento": "balance_clasificado|balance_8col|estado_resultados|flujo_efectivo|mixto|desconocido",

  "seccionPagina": "balance|resultados|flujo_efectivo|notas|segmentos|resumen_ejecutivo|operativo|otro",

  "metadata": { "razonSocial", "rut", "moneda", "escala": "unidades|miles|millones|indeterminada", "periodo": { "ejercicio", "desde", "hasta" } },

  "notas": [{ "rubroRef", "texto" }],

  "lineas": [{

    "denominacionOriginal", "codigoOrigen", "columnaOrigen",

    "montoOriginalTexto", "montoOriginal", "paginaNumero",

    "confianzaExtraccion", "seccionPagina", "fuentePrioridad", "estadoFinancieroLinea"

  }],

  "indicadoresFinancieros": [{ "denominacion", "valor", "unidad", "paginaNumero" }],

  "indicadoresOperativos": [{ "denominacion", "valor", "unidad", "paginaNumero" }]

}

Incluye paginaNumero=${pageNum ?? 1} en cada línea. Sin markdown.`;

}



/** Prompt mínimo — PDFs pesados o memoria anual; evita truncar el JSON. */

export function buildExtractPromptMinimal(_tipoHint?: string, pageNum?: number, totalPages?: number): string {

  const pageCtx =

    pageNum != null && totalPages != null ? ` Página ${pageNum} de ${totalPages}.` : "";



  return `Documento financiero${pageCtx}. Extraé filas de ESTADOS FINANCIEROS ESTRUCTURADOS (balance, resultados, flujo de efectivo).

NO extraigas volúmenes, cemento, toneladas, EBITDA de resumen ni variaciones %.

Priorizá fuentePrioridad "canonico" sobre resúmenes. Si un concepto ya está en un estado estructurado, no lo repitas desde un resumen.

Leé del encabezado: razonSocial, moneda, escala, periodo.ejercicio (número entero, omitir si no está claro).



Responde SOLO JSON compacto:

{"tipoDocumento":"balance_clasificado|balance_8col|estado_resultados|flujo_efectivo|mixto|desconocido","seccionPagina":"balance|resultados|flujo_efectivo|notas|segmentos|resumen_ejecutivo|operativo|otro","metadata":{"razonSocial","moneda","escala","periodo":{"ejercicio"}},"lineas":[{"denominacionOriginal","montoOriginal","paginaNumero":${pageNum ?? 1},"seccionPagina","fuentePrioridad","estadoFinancieroLinea"}]}

Sin notas, sin transcripción, sin markdown.`;

}



/** Solo metadatos del encabezado — re-lectura IA sin reprocesar líneas. */

export function buildMetadataOnlyPrompt(): string {

  return `Leé el encabezado de este documento financiero chileno (balance o estado de resultados).

${METADATA_RULES}

Responde SOLO JSON válido:

{

  "metadata": { "razonSocial", "rut", "moneda", "escala": "unidades|miles|millones|indeterminada", "periodo": { "ejercicio", "desde", "hasta" } }

}

No incluyas líneas contables.`;

}


