import type { FastifyInstance } from "fastify";

import { computeKpis } from "../services/kpis.js";

import { authenticate } from "../plugins/auth.js";

import { adminOrPo, lecturaEquipo } from "../plugins/rbac.js";



function parsePeriod(query: { desde?: string; hasta?: string }) {

  return {

    desde: query.desde ? new Date(query.desde) : undefined,

    hasta: query.hasta ? new Date(query.hasta) : undefined,

  };

}



export async function kpisRoutes(app: FastifyInstance): Promise<void> {

  app.get(

    "/kpis",

    { preHandler: [authenticate, lecturaEquipo] },

    async (request) => {

      const q = request.query as { desde?: string; hasta?: string };

      return computeKpis(parsePeriod(q));

    }

  );



  app.get(

    "/kpis/export",

    { preHandler: [authenticate, adminOrPo] },

    async (request, reply) => {

      const q = request.query as { desde?: string; hasta?: string; format?: string };

      const data = await computeKpis(parsePeriod(q));



      if (q.format === "csv") {

        const rows: Array<[string, string | number]> = [
          ["concepto", "valor"],
          ["Fichas en el sistema", data.resumen.totalCasos],
          ["Esperando revisión del analista", data.resumen.enRevision],
          ["Fichas cerradas (aprobadas)", data.resumen.aprobados],
          ["Informes de comité generados", data.resumen.informesGenerados],
          ["Resueltas sin intervención humana (%)", data.operacion.tasaResolucionAutomaticaPct],
          ["Documentos procesados correctamente (%)", data.operacion.coberturaProcesamientoPct ?? ""],
          ["Líneas procesadas", data.operacion.lineasProcesadas],
          ["Líneas pendientes de revisión", data.operacion.lineasPendientesRevision],
          ["Tiempo promedio hasta aprobar (min)", data.tiempos?.promedioMinutosAprobacion ?? ""],
          ["Meta de tiempo del equipo (min)", data.tiempos?.metaMinutos ?? ""],
          ["Mejora vs. proceso manual (%)", data.tiempos?.reduccionVsBaselineHorasPct ?? ""],
          [
            "Fichas cerradas que cuadran",
            data.calidad?.casosConCuadraturaOk != null && data.calidad?.casosCuadraturaTotal
              ? `${data.calidad.casosConCuadraturaOk} de ${data.calidad.casosCuadraturaTotal} (${data.calidad.pctCuadraturaVerificada}%)`
              : data.calidad?.pctCuadraturaVerificada ?? "",
          ],
          ["Con trazabilidad completa (%)", data.calidad?.pctTrazabilidadCompleta ?? ""],
          ["Sin revisión línea a línea (%)", data.calidad?.pctCasosSinIntervencionHumana ?? ""],
          ["Alertas confirmadas por el equipo", data.calidad?.inconsistenciasConfirmadas ?? ""],
          ["Empresas con historial previo", data.aprendizaje?.contribuyentesConHistorial ?? ""],
          ["Incidentes de procesamiento", data.pipelineErrores ?? 0],
          ["Generado el", data.generadoAt],
        ];

        const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");

        reply.header("Content-Type", "text/csv; charset=utf-8");

        reply.header("Content-Disposition", 'attachment; filename="resumen-equipo-ffa.csv"');

        return csv;

      }



      reply.header("Content-Type", "application/json");

      reply.header("Content-Disposition", 'attachment; filename="resumen-equipo-ffa.json"');

      return data;

    }

  );

}

