import {
  CasoModel,
  ContribuyenteModel,
  DocumentoFuenteModel,
  FichaCanonicaModel,
  IndicadorCalculadoModel,
  LineaContableModel,
  RubroInstitucionalModel,
  ValidacionResultadoModel,
  type FichaCanonicaDocument,
  type IndicadorCalculadoDocument,
} from "@ffa/db";
import { emitIaLlamada, runWithIaContext, type ExtractResult } from "@ffa/pipeline";
import {
  fmtIndicadorValor,
  fmtMonto,
  indicadorNombre,
  resolveIdentidadInforme,
} from "./informe-helpers.js";
import { buildResumenEjecutivo, buildDemoApartados } from "./informe-render.js";

export type InformeNarrativaIa = {
  resumenEjecutivo: string;
  apartadoAnalisis: string;
  apartadoRecomendacion: string;
  origen: "anthropic" | "plantilla";
  modelo?: string;
  error?: string;
};

const MAX_LINEAS_PROMPT = 600;
const MAX_TRANSCRIPCION_CHARS = 80_000;

function anthropicInformeModels(): string[] {
  const configured = process.env.ANTHROPIC_INFORME_MODEL?.trim();
  const fallbacks = ["claude-sonnet-4-6", "claude-sonnet-5"];
  return [...new Set([configured, ...fallbacks].filter(Boolean))] as string[];
}

function anthropicTimeoutMs(): number {
  const n = Number(process.env.ANTHROPIC_INFORME_TIMEOUT_MS ?? 240_000);
  return Number.isFinite(n) && n > 0 ? n : 240_000;
}

function parseInformeJson(content: string): {
  resumen_ejecutivo?: string;
  apartado_analisis?: string;
  apartado_recomendacion?: string;
} {
  let text = content.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced) text = fenced[1]!.trim();
  else {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) text = text.slice(start, end + 1);
  }
  return JSON.parse(text) as {
    resumen_ejecutivo?: string;
    apartado_analisis?: string;
    apartado_recomendacion?: string;
  };
}

async function callAnthropicInforme(prompt: string): Promise<{ text: string; model: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada");

  let lastError = "Error desconocido";
  for (const model of anthropicInformeModels()) {
    const started = Date.now();
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(anthropicTimeoutMs()),
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (res.status === 404) {
      lastError = `modelo ${model} no encontrado`;
      await emitIaLlamada({
        proveedor: "anthropic",
        modelo: model,
        funcion: "informe_narrativa",
        tokensEntrada: 0,
        tokensSalida: 0,
        duracionMs: Date.now() - started,
        exito: false,
        error: lastError,
      });
      continue;
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      const errMsg = `Anthropic HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`;
      await emitIaLlamada({
        proveedor: "anthropic",
        modelo: model,
        funcion: "informe_narrativa",
        tokensEntrada: 0,
        tokensSalida: 0,
        duracionMs: Date.now() - started,
        exito: false,
        error: errMsg,
      });
      throw new Error(errMsg);
    }

    const body = (await res.json()) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    await emitIaLlamada({
      proveedor: "anthropic",
      modelo: model,
      funcion: "informe_narrativa",
      tokensEntrada: body.usage?.input_tokens ?? 0,
      tokensSalida: body.usage?.output_tokens ?? 0,
      duracionMs: Date.now() - started,
      exito: true,
    });

    const text = body.content?.find((c) => c.type === "text")?.text?.trim();
    if (!text) throw new Error("Anthropic devolvió respuesta vacía");
    return { text, model };
  }

  throw new Error(`Ningún modelo Anthropic disponible (${lastError})`);
}

async function buildInformeContextPayload(fichaId: string): Promise<Record<string, unknown>> {
  const ficha = await FichaCanonicaModel.findById(fichaId);
  if (!ficha) throw new Error("Ficha no encontrada");

  const casoId = ficha.casoId.toString();
  const [caso, indicadores, contrib, docs, lineas, validaciones] = await Promise.all([
    CasoModel.findById(ficha.casoId),
    IndicadorCalculadoModel.find({ fichaId }),
    ficha.contribuyenteId ? ContribuyenteModel.findById(ficha.contribuyenteId) : null,
    DocumentoFuenteModel.find({ casoId }).sort({ createdAt: 1 }),
    LineaContableModel.find({ casoId }).sort({ paginaNumero: 1, denominacionOriginal: 1 }),
    ValidacionResultadoModel.find({ casoId }).sort({ tipo: 1 }),
  ]);
  if (!caso) throw new Error("Caso no encontrado");

  const identidad = await resolveIdentidadInforme(casoId, contrib, caso.periodo?.ejercicio);
  const moneda = caso.moneda ?? "CLP";
  const escala = caso.escala ?? "miles";

  const rubroIds = [
    ...new Set(lineas.map((l) => l.rubroInstitucionalId?.toString()).filter(Boolean) as string[]),
  ];
  const rubros = rubroIds.length
    ? await RubroInstitucionalModel.find({ _id: { $in: rubroIds } }).select("codigo nombre")
    : [];
  const rubroMap = new Map(rubros.map((r) => [r._id.toString(), `${r.codigo} · ${r.nombre}`]));

  const lineasPayload = lineas.slice(0, MAX_LINEAS_PROMPT).map((l) => ({
    pagina: l.paginaNumero,
    denominacion: l.denominacionOriginal,
    monto: l.montoNormalizado ?? l.montoOriginal,
    montoFmt: fmtMonto(l.montoNormalizado ?? l.montoOriginal, moneda, escala),
    rubro: l.rubroInstitucionalId
      ? rubroMap.get(l.rubroInstitucionalId.toString()) ?? l.rubroCodigo
      : l.rubroCodigo ?? null,
    confianzaExtraccion: l.confianzaExtraccion,
    confianzaClasificacion: l.confianzaClasificacion,
    requiereRevision: l.requiereRevision,
    estado: l.estado,
  }));

  const docPrincipal = docs[0];
  const extractPayload = docPrincipal?.extractPayload as ExtractResult | undefined;

  const transcripcionRaw =
    docPrincipal?.extractTranscripcion?.map((t) => ({
      pagina: t.pagina,
      texto: t.texto,
    })) ??
    extractPayload?.transcripcionPaginas ??
    (extractPayload?.textoPagina?.trim()
      ? [{ pagina: 1, texto: extractPayload.textoPagina.trim() }]
      : []);

  let transcripcionTexto = transcripcionRaw
    .map((t) => `=== Página ${t.pagina} ===\n${t.texto}`)
    .join("\n\n");
  const transcripcionTruncada = transcripcionTexto.length > MAX_TRANSCRIPCION_CHARS;
  if (transcripcionTruncada) {
    transcripcionTexto = `${transcripcionTexto.slice(0, MAX_TRANSCRIPCION_CHARS)}\n\n[… transcripción truncada para el prompt …]`;
  }

  return {
    identidad: {
      razonSocial: identidad.razonSocial,
      rut: identidad.rut,
      ejercicio: identidad.ejercicio,
      numeroCaso: caso.numero,
      referencia: caso.referencia ?? null,
    },
    expresionMontos: { moneda, escala },
    calidadCaso: {
      semaforo: caso.semaforo ?? ficha.validacionesResumen?.semaforo,
      confianzaGlobalPct: caso.confianzaGlobal,
      cuadraturaOk: ficha.validacionesResumen?.cuadraturaOk,
      trazabilidadCompleta: ficha.validacionesResumen?.trazabilidadCompleta,
    },
    ficha: {
      version: ficha.version,
      observaciones: ficha.observaciones ?? null,
      balance: {
        activoCorriente: ficha.balance?.activoCorriente,
        activoNoCorriente: ficha.balance?.activoNoCorriente,
        pasivoCorriente: ficha.balance?.pasivoCorriente,
        pasivoNoCorriente: ficha.balance?.pasivoNoCorriente,
        patrimonio: ficha.balance?.patrimonio,
        detalle: (ficha.balance?.detalle ?? []).map((d) => ({
          codigo: d.codigo,
          monto: d.monto,
          montoFmt: fmtMonto(d.monto, moneda, escala),
        })),
      },
      estadoResultados: {
        utilidad: ficha.estadoResultados?.utilidad,
        utilidadFmt: fmtMonto(ficha.estadoResultados?.utilidad, moneda, escala),
        detalle: (ficha.estadoResultados?.detalle ?? []).map((d) => ({
          codigo: d.codigo,
          monto: d.monto,
          montoFmt: fmtMonto(d.monto, moneda, escala),
        })),
      },
    },
    indicadores: indicadores.map((i) => ({
      codigo: i.indicadorCodigo,
      nombre: indicadorNombre(i.indicadorCodigo),
      calculable: i.calculable,
      valor: i.valor,
      valorFmt: i.calculable
        ? fmtIndicadorValor(i.indicadorCodigo, i.valor, { moneda, escala })
        : null,
      error: i.error ?? null,
    })),
    validaciones: validaciones.map((v) => ({
      tipo: v.tipo,
      severidad: v.severidad,
      passed: v.passed,
      mensaje: v.mensaje,
      confirmadaPorAnalista: v.confirmadaPorAnalista,
    })),
    documentos: docs.map((d) => ({
      nombre: d.nombreOriginal,
      tipoDocumento: d.tipoDocumento,
      paginasTotales: d.paginaCount,
      paginasTranscritas: d.extractTranscripcion?.length ?? 0,
      extraccionIncompleta: d.preprocessFlags?.incompleto === true,
      metadata: d.extractMetadata ?? null,
      notas: (d.extractNotas ?? []).map((n) => ({
        rubroRef: n.rubroRef,
        texto: n.texto,
      })),
      extractPayloadResumen: extractPayload
        ? {
            tipoDocumento: extractPayload.tipoDocumento,
            lineasEnPayload: extractPayload.lineas?.length ?? 0,
            totales: extractPayload.totales ?? [],
            encabezados: extractPayload.encabezados ?? [],
          }
        : null,
    })),
    transcripcionDocumento: transcripcionTexto
      ? {
          paginas: transcripcionRaw.length,
          truncada: transcripcionTruncada,
          texto: transcripcionTexto,
        }
      : null,
    lineasContables: {
      total: lineas.length,
      incluidasEnPrompt: lineasPayload.length,
      truncadas: lineas.length > MAX_LINEAS_PROMPT,
      items: lineasPayload,
    },
    extractPayloadLineas:
      extractPayload?.lineas?.slice(0, 200).map((l) => ({
        pagina: l.paginaNumero,
        denominacion: l.denominacionOriginal,
        monto: l.montoOriginal,
        codigo: l.codigoOrigen ?? null,
      })) ?? [],
  };
}

function buildPlantillaNarrativa(
  ficha: FichaCanonicaDocument,
  caso: {
    numero: string;
    semaforo?: string | null;
    confianzaGlobal?: number | null;
    moneda?: string | null;
    escala?: string | null;
    periodoEjercicio?: number | null;
  },
  identidad: { razonSocial: string; rut: string; ejercicio?: number | null },
  indicadores: IndicadorCalculadoDocument[]
): InformeNarrativaIa {
  const moneda = caso.moneda ?? "CLP";
  const escala = caso.escala ?? "miles";
  const periodo = String(identidad.ejercicio ?? caso.periodoEjercicio ?? "—");
  const semaforo = caso.semaforo ?? ficha.validacionesResumen?.semaforo ?? "amarillo";

  const resumenEjecutivo = buildResumenEjecutivo({
    razonSocial: identidad.razonSocial,
    periodo,
    semaforo,
    confianza: caso.confianzaGlobal,
    indicadores,
    moneda,
    escala,
  });

  const apartados = buildDemoApartados({
    razonSocial: identidad.razonSocial,
    numeroCaso: caso.numero,
    semaforo,
    confianza: caso.confianzaGlobal ?? 0,
    indicadores,
    final: false,
    moneda,
    escala,
  });

  return {
    resumenEjecutivo,
    apartadoAnalisis: apartados.analisis,
    apartadoRecomendacion: apartados.recomendacion,
    origen: "plantilla",
  };
}

export async function generarNarrativaInforme(
  fichaId: string,
  ctx?: { userId?: string; casoId?: string }
): Promise<InformeNarrativaIa> {
  const ficha = await FichaCanonicaModel.findById(fichaId);
  if (!ficha) throw new Error("Ficha no encontrada");

  const caso = await CasoModel.findById(ficha.casoId);
  if (!caso) throw new Error("Caso no encontrado");

  const [indicadores, contrib] = await Promise.all([
    IndicadorCalculadoModel.find({ fichaId }),
    ficha.contribuyenteId ? ContribuyenteModel.findById(ficha.contribuyenteId) : null,
  ]);
  const identidad = await resolveIdentidadInforme(
    ficha.casoId.toString(),
    contrib,
    caso.periodo?.ejercicio
  );

  const casoResumen = {
    numero: caso.numero,
    semaforo: caso.semaforo,
    confianzaGlobal: caso.confianzaGlobal,
    moneda: caso.moneda,
    escala: caso.escala,
    periodoEjercicio: caso.periodo?.ejercicio ?? null,
  };

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return {
      ...buildPlantillaNarrativa(ficha, casoResumen, identidad, indicadores),
      error: "ANTHROPIC_API_KEY no configurada — informe generado con plantilla estática",
    };
  }

  const iaCtx = {
    actorTipo: "usuario" as const,
    actorId: ctx?.userId,
    casoId: ctx?.casoId ?? ficha.casoId.toString(),
  };

  try {
    const contexto = await buildInformeContextPayload(fichaId);
    const prompt = `Sos analista senior de crédito comercial / factoring (ECR Salud, Chile). Redactá las secciones narrativas de un informe para comité usando EXCLUSIVAMENTE los datos JSON adjuntos.

REGLAS:
- Español rioplatense profesional (Chile: montos en moneda/escala del JSON).
- NO inventes cifras ni empresas que no estén en el JSON.
- Analizá TODA la información: transcripción literal del PDF, balance, ER, indicadores, validaciones, líneas contables, notas del documento y calidad del caso.
- Si hay transcripcionDocumento, usala como fuente primaria del lenguaje cualitativo (notas, aclaraciones, contexto).
- Mencioná riesgos concretos si hay validaciones fallidas, semáforo rojo/amarillo, baja confianza o líneas sin clasificar.
- apartado_recomendacion debe ser accionable para comité: favorable / favorable con reservas / no favorable.

Respondé ÚNICAMENTE un objeto JSON válido (sin markdown):
{
  "resumen_ejecutivo": "3-5 oraciones ejecutivas",
  "apartado_analisis": "4-8 párrafos separados por \\n\\n con análisis financiero profundo",
  "apartado_recomendacion": "2-4 párrafos con recomendación explícita para comité"
}

DATOS DEL CASO:
${JSON.stringify(contexto)}`;

    const { text, model } = await runWithIaContext(iaCtx, () => callAnthropicInforme(prompt));
    const parsed = parseInformeJson(text);

    const resumen = parsed.resumen_ejecutivo?.trim();
    const analisis = parsed.apartado_analisis?.trim();
    const recomendacion = parsed.apartado_recomendacion?.trim();

    if (!resumen || !analisis || !recomendacion) {
      throw new Error("La IA no devolvió las tres secciones requeridas");
    }

    return {
      resumenEjecutivo: resumen,
      apartadoAnalisis: analisis,
      apartadoRecomendacion: recomendacion,
      origen: "anthropic",
      modelo: model,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ...buildPlantillaNarrativa(ficha, casoResumen, identidad, indicadores),
      origen: "plantilla",
      error: `Falló generación con Anthropic: ${msg}`,
    };
  }
}
