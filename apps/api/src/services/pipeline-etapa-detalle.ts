import {
  CasoModel,
  DocumentoFuenteModel,
  FichaCanonicaModel,
  IndicadorCalculadoModel,
  InformeComiteModel,
  LineaContableModel,
  ValidacionResultadoModel,
} from "@ffa/db";
import { CasoEstado, type PipelineEtapaDetalleDto } from "@ffa/shared";
import { getPipelineEtapas } from "./pipeline-etapas.js";

const CANAL_LABEL: Record<string, string> = {
  portal: "Portal web",
  correo: "Correo electrónico",
  manual_alternativa: "Carga manual",
};

const CALIDAD_LABEL: Record<string, string> = {
  nativo: "PDF nativo (texto seleccionable)",
  escaneado_legible: "Escaneado legible",
  degradado: "Calidad degradada",
  ilegible: "Ilegible — requiere revisión",
  pendiente: "Pendiente de evaluar",
};

const TIPO_DOC_LABEL: Record<string, string> = {
  balance_8col: "Balance 8 columnas",
  balance_clasificado: "Balance clasificado",
  estado_resultados: "Estado de resultados",
  ifrs: "Estados IFRS",
  mixto: "Documento mixto",
  desconocido: "Tipo no identificado",
};

function fmtDate(d?: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtMonto(n?: number | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("es-CL");
}

function pasoEstado(
  completada: boolean,
  index: number,
  firstPending: number
): "listo" | "en_curso" | "pendiente" {
  if (completada) return "listo";
  return index === firstPending ? "en_curso" : "pendiente";
}

export async function getPipelineEtapaDetalle(
  casoId: string,
  etapaId: string
): Promise<PipelineEtapaDetalleDto | null> {
  const etapas = await getPipelineEtapas(casoId);
  const index = etapas.findIndex((e) => e.id === etapaId);
  if (index < 0) return null;

  const etapa = etapas[index]!;
  const firstPending = etapas.findIndex((e) => !e.completada);
  const estado = pasoEstado(etapa.completada, index, firstPending);

  const [caso, docs, lineas, validaciones, ficha, informe] = await Promise.all([
    CasoModel.findById(casoId),
    DocumentoFuenteModel.find({ casoId }),
    LineaContableModel.find({ casoId }).sort({ paginaNumero: 1, lineaEnPagina: 1 }).limit(200),
    ValidacionResultadoModel.find({ casoId }).sort({ at: -1 }),
    FichaCanonicaModel.findOne({ casoId }),
    InformeComiteModel.findOne({ casoId, estado: { $ne: "archivado" } }).sort({
      createdAt: -1,
    }),
  ]);

  if (!caso) return null;

  const indicadores = ficha
    ? await IndicadorCalculadoModel.find({ fichaId: ficha._id })
    : [];

  const titulos: Record<string, string> = {
    "AA.1": "Documento recibido",
    "AA.2": "Lectura del documento",
    "AA.3": "Ajuste de moneda y período",
    "AA.4": "Clasificación contable",
    "AA.5": "Controles automáticos",
    "AA.6": "Revisión del analista",
    "AA.7": "Indicadores financieros",
    "AA.8": "Informe para comité",
  };

  const base = {
    etapaId,
    titulo: titulos[etapaId] ?? etapa.nombre,
    estado,
  };

  switch (etapaId) {
    case "AA.1": {
      const logs = docs.flatMap((d) =>
        (d.preprocessLog ?? []).map((l) => ({
          at: l.at?.toISOString(),
          etapa: l.etapa ?? undefined,
          mensaje: `[${d.nombreOriginal}] ${l.mensaje ?? ""}`,
        }))
      );
      return {
        ...base,
        resumen:
          docs.length > 0
            ? `${docs.length} archivo(s) registrado(s) y asociado(s) a este expediente.`
            : "Aún no hay documentos cargados en el expediente.",
        items: docs.length
          ? docs.flatMap((d, i) => [
              { label: i === 0 ? "Archivo" : "Archivo (adicional)", value: d.nombreOriginal },
              { label: "Formato", value: d.mimeType },
              { label: "Canal de ingreso", value: CANAL_LABEL[d.canal] ?? d.canal },
              {
                label: "Calidad detectada",
                value: CALIDAD_LABEL[d.calidadOrigen ?? "pendiente"] ?? d.calidadOrigen ?? "—",
              },
              { label: "Páginas", value: String(d.paginaCount ?? 0) },
              { label: "Recibido", value: fmtDate(d.recepcion?.at) },
            ])
          : [{ label: "Estado", value: "Sin documentos en el expediente" }],
        logs: logs.length ? logs.slice(0, 12) : undefined,
        enlaces: docs[0]
          ? [
              {
                label: "Ver documento original (PDF)",
                to: `/api/v1/casos/${casoId}/documentos/${docs[0]._id.toString()}/file`,
                external: true,
              },
            ]
          : undefined,
      };
    }

    case "AA.2": {
      const lineasMuestra = lineas.slice(0, 10);
      const meta = docs[0]?.extractMetadata;
      return {
        ...base,
        resumen:
          lineas.length > 0
            ? `Se extrajeron ${lineas.length} fila(s) contables del documento.`
            : "El motor de lectura aún no terminó o no encontró filas en el PDF.",
        items: [
          { label: "Filas extraídas", value: String(lineas.length) },
          {
            label: "Tipo de documento",
            value: TIPO_DOC_LABEL[docs[0]?.tipoDocumento ?? "desconocido"] ?? docs[0]?.tipoDocumento ?? "—",
          },
          { label: "Razón social detectada", value: meta?.razonSocial ?? "—" },
          { label: "RUT detectado", value: meta?.rut ?? "—" },
          {
            label: "Progreso técnico",
            value: docs[0]?.procesamiento?.etapaActual
              ? `${docs[0].procesamiento.etapaActual}${docs[0].procesamiento.progresoPct != null ? ` · ${docs[0].procesamiento.progresoPct}%` : ""}`
              : "—",
          },
          ...(docs[0]?.procesamiento?.ultimoError
            ? [{ label: "Último error", value: docs[0].procesamiento.ultimoError }]
            : []),
        ],
        tablas: lineasMuestra.length
          ? [
              {
                titulo: "Muestra de filas leídas",
                columnas: ["Concepto", "Monto", "Pág."],
                filas: lineasMuestra.map((l) => [
                  l.denominacionOriginal,
                  fmtMonto(l.montoNormalizado ?? l.montoOriginal),
                  String(l.paginaNumero ?? "—"),
                ]),
              },
            ]
          : undefined,
        enlaces: docs[0]
          ? [
              {
                label: "Ver documento fuente",
                to: `/api/v1/casos/${casoId}/documentos/${docs[0]._id.toString()}/file`,
                external: true,
              },
            ]
          : undefined,
      };
    }

    case "AA.3": {
      const logs = docs.flatMap((d) =>
        (d.normalizeLog ?? []).map((l) => ({
          at: l.at?.toISOString(),
          etapa: l.etapa ?? undefined,
          mensaje: l.mensaje ?? "",
        }))
      );
      const meta = docs[0]?.extractMetadata;
      return {
        ...base,
        resumen:
          caso.moneda || caso.escala
            ? "Moneda, escala y ejercicio quedaron normalizados para las etapas siguientes."
            : "El sistema aún no detectó metadatos contables del documento.",
        items: [
          { label: "Moneda del caso", value: caso.moneda ?? meta?.moneda ?? "—" },
          { label: "Escala", value: caso.escala ?? meta?.escala ?? "—" },
          {
            label: "Ejercicio fiscal",
            value: String(caso.periodo?.ejercicio ?? meta?.periodo?.ejercicio ?? "—"),
          },
          {
            label: "Período",
            value:
              caso.periodo?.desde && caso.periodo?.hasta
                ? `${fmtDate(caso.periodo.desde)} — ${fmtDate(caso.periodo.hasta)}`
                : "—",
          },
        ],
        logs: logs.length ? logs.slice(0, 10) : undefined,
      };
    }

    case "AA.4": {
      const clasificadas = lineas.filter((l) => l.rubroInstitucionalId);
      const muestra = clasificadas.slice(0, 10);
      return {
        ...base,
        resumen:
          clasificadas.length > 0
            ? `${clasificadas.length} de ${lineas.length} fila(s) tienen rubro institucional asignado.`
            : "Las líneas aún no fueron clasificadas contra el plan de cuentas.",
        items: [
          { label: "Líneas totales", value: String(lineas.length) },
          { label: "Líneas clasificadas", value: String(clasificadas.length) },
          {
            label: "Pendientes de rubro",
            value: String(Math.max(0, lineas.length - clasificadas.length)),
          },
          {
            label: "Confianza global del caso",
            value: caso.confianzaGlobal != null ? `${caso.confianzaGlobal}%` : "—",
          },
        ],
        tablas: muestra.length
          ? [
              {
                titulo: "Muestra de clasificación",
                columnas: ["Concepto", "Rubro", "Confianza"],
                filas: muestra.map((l) => [
                  l.denominacionOriginal,
                  l.rubroCodigo ?? "Sin rubro",
                  l.confianzaClasificacion != null ? `${l.confianzaClasificacion}%` : "—",
                ]),
              },
            ]
          : undefined,
        enlaces:
          caso.estado === CasoEstado.EN_REVISION ||
          caso.estado === CasoEstado.APROBADO ||
          caso.estado === CasoEstado.INFORME_GENERADO
            ? [{ label: "Ir a revisión de líneas", to: `/casos/${casoId}/revision` }]
            : undefined,
      };
    }

    case "AA.5": {
      const fallidas = validaciones.filter((v) => !v.passed);
      return {
        ...base,
        resumen: validaciones.length
          ? `${validaciones.length} control(es) ejecutado(s)${caso.semaforo ? ` · semáforo ${caso.semaforo}` : ""}.`
          : "Los controles automáticos aún no se ejecutaron.",
        items: [
          { label: "Semáforo", value: caso.semaforo ?? "Sin calcular" },
          { label: "Confianza global", value: caso.confianzaGlobal != null ? `${caso.confianzaGlobal}%` : "—" },
          { label: "Umbral aplicado", value: caso.umbralAplicado != null ? `${caso.umbralAplicado}%` : "—" },
          { label: "Validaciones OK", value: String(validaciones.filter((v) => v.passed).length) },
          { label: "Alertas / fallos", value: String(fallidas.length) },
        ],
        tablas: validaciones.length
          ? [
              {
                titulo: "Resultado de validaciones",
                columnas: ["Tipo", "Resultado", "Mensaje"],
                filas: validaciones.slice(0, 12).map((v) => [
                  v.tipo,
                  v.passed ? "OK" : v.severidad ?? "Fallo",
                  v.mensaje,
                ]),
              },
            ]
          : undefined,
      };
    }

    case "AA.6": {
      return {
        ...base,
        resumen: ficha
          ? `Ficha canónica en estado «${ficha.estado}» (versión ${ficha.version ?? 1}).`
          : "La ficha todavía no fue generada para revisión analítica.",
        items: [
          { label: "Estado del caso", value: caso.estado },
          { label: "Estado de la ficha", value: ficha?.estado ?? "Sin ficha" },
          { label: "Versión ficha", value: ficha ? String(ficha.version ?? 1) : "—" },
          { label: "Aprobada", value: ficha?.aprobadaAt ? fmtDate(ficha.aprobadaAt) : "—" },
          {
            label: "Cuadratura (resumen)",
            value:
              ficha?.validacionesResumen?.cuadraturaOk === true
                ? "Verificada"
                : ficha?.validacionesResumen?.cuadraturaOk === false
                  ? "Con diferencias"
                  : "—",
          },
        ],
        enlaces:
          caso.estado === CasoEstado.EN_REVISION ||
          caso.estado === CasoEstado.APROBADO ||
          caso.estado === CasoEstado.INFORME_GENERADO
            ? [{ label: "Abrir pantalla de revisión", to: `/casos/${casoId}/revision` }]
            : undefined,
      };
    }

    case "AA.7": {
      return {
        ...base,
        resumen: indicadores.length
          ? `${indicadores.length} indicador(es) calculado(s) sobre la ficha aprobada.`
          : "Los indicadores se calculan cuando la ficha está aprobada.",
        items: indicadores.map((i) => ({
          label: i.indicadorCodigo,
          value: i.calculable ? String(i.valor ?? "—") : `N/C (${i.error ?? "—"})`,
        })),
        enlaces: ficha
          ? [{ label: "Ver ficha e indicadores", to: `/casos/${casoId}/informe` }]
          : undefined,
      };
    }

    case "AA.8": {
      return {
        ...base,
        resumen: informe
          ? `Informe de comité en estado «${informe.estado}».`
          : "Todavía no se generó el informe para presentación en comité.",
        items: informe
          ? [
              { label: "Estado", value: informe.estado },
              { label: "Generado", value: fmtDate(informe.generadoAt) },
              { label: "Finalizado", value: informe.finalizadoAt ? fmtDate(informe.finalizadoAt) : "—" },
              { label: "Versión ficha base", value: String(informe.fichaVersion ?? 1) },
              { label: "Export Word", value: informe.storageKeyDocx ? "Disponible" : "No generado" },
            ]
          : [{ label: "Estado", value: "Sin informe" }],
        enlaces:
          informe || caso.estado === CasoEstado.APROBADO || caso.estado === CasoEstado.INFORME_GENERADO
            ? [{ label: "Abrir informe de comité", to: `/casos/${casoId}/informe` }]
            : undefined,
      };
    }

    default:
      return {
        ...base,
        resumen: etapa.detalle ?? "Sin información adicional.",
        items: [{ label: "Detalle", value: etapa.detalle ?? "—" }],
      };
  }
}
