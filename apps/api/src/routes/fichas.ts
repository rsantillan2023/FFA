import {
  FichaCanonicaModel,
  IndicadorCalculadoModel,
  RubroInstitucionalModel,
} from "@ffa/db";
import type { FichaCanonicaDto, IndicadorCalculadoDto } from "@ffa/shared";
import type { FastifyInstance } from "fastify";
import { calcularIndicadoresFicha } from "../services/ficha-indicadores.js";
import { authenticate } from "../plugins/auth.js";
import { edicionEquipo, lecturaEquipo } from "../plugins/rbac.js";

export async function fichasRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/fichas/caso/:casoId",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const { casoId } = request.params as { casoId: string };
      const ficha = await FichaCanonicaModel.findOne({ casoId });
      if (!ficha) return reply.code(404).send({ error: "Ficha no encontrada" });
      return mapFicha(ficha);
    }
  );

  app.get(
    "/fichas/:id",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const ficha = await FichaCanonicaModel.findById(id);
      if (!ficha) return reply.code(404).send({ error: "Ficha no encontrada" });

      const rubros = await RubroInstitucionalModel.find({
        planCuentasVersionId: ficha.planCuentasVersionId,
      });
      const rubroNames = new Map(rubros.map((r) => [r.codigo, r.nombre]));

      return {
        ...mapFicha(ficha),
        balance: {
          activoCorriente: ficha.balance?.activoCorriente,
          activoNoCorriente: ficha.balance?.activoNoCorriente,
          pasivoCorriente: ficha.balance?.pasivoCorriente,
          pasivoNoCorriente: ficha.balance?.pasivoNoCorriente,
          patrimonio: ficha.balance?.patrimonio,
          detalle: (ficha.balance?.detalle ?? []).map((d) => ({
            codigo: d.codigo,
            nombre: rubroNames.get(d.codigo) ?? d.codigo,
            monto: d.monto,
            lineasIds: (d.lineasIds ?? []).map((id) => id.toString()),
          })),
        },
        estadoResultados: {
          utilidad: ficha.estadoResultados?.utilidad,
          detalle: (ficha.estadoResultados?.detalle ?? []).map((d) => ({
            codigo: d.codigo,
            nombre: rubroNames.get(d.codigo) ?? d.codigo,
            monto: d.monto,
            lineasIds: (d.lineasIds ?? []).map((id) => id.toString()),
          })),
        },
        observaciones: ficha.observaciones,
      };
    }
  );

  app.get(
    "/fichas/:id/indicadores",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply): Promise<IndicadorCalculadoDto[]> => {
      const { id } = request.params as { id: string };
      const ficha = await FichaCanonicaModel.findById(id);
      if (!ficha) return reply.code(404).send({ error: "Ficha no encontrada" });

      const items = await IndicadorCalculadoModel.find({ fichaId: id });
      return items.map((i) => ({
        id: i._id.toString(),
        fichaId: id,
        codigo: i.indicadorCodigo,
        valor: i.valor ?? null,
        calculable: i.calculable,
        error: i.error ?? undefined,
        calculadoAt: i.calculadoAt.toISOString(),
      }));
    }
  );

  app.post(
    "/fichas/:id/recalcular-indicadores",
    { preHandler: [authenticate, edicionEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const ficha = await FichaCanonicaModel.findById(id);
      if (!ficha) return reply.code(404).send({ error: "Ficha no encontrada" });
      const count = await calcularIndicadoresFicha(id);
      return { recalculados: count };
    }
  );

  app.get(
    "/fichas/:id/export/json",
    { preHandler: [authenticate, lecturaEquipo] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const ficha = await FichaCanonicaModel.findById(id).lean();
      if (!ficha) return reply.code(404).send({ error: "Ficha no encontrada" });
      return reply.header("Content-Disposition", `attachment; filename="ficha-${id}.json"`).send(ficha);
    }
  );
}

function mapFicha(ficha: {
  _id: { toString(): string };
  casoId: { toString(): string };
  estado: string;
  version: number;
  validacionesResumen?: { cuadraturaOk?: boolean | null; semaforo?: string | null } | null;
  aprobadaAt?: Date | null;
  balance?: {
    activoCorriente?: number | null;
    activoNoCorriente?: number | null;
    pasivoCorriente?: number | null;
    pasivoNoCorriente?: number | null;
    patrimonio?: number | null;
  } | null;
  estadoResultados?: { utilidad?: number | null } | null;
}): FichaCanonicaDto {
  return {
    id: ficha._id.toString(),
    casoId: ficha.casoId.toString(),
    estado: ficha.estado,
    version: ficha.version,
    validacionesResumen: ficha.validacionesResumen
      ? {
          cuadraturaOk: ficha.validacionesResumen.cuadraturaOk ?? undefined,
          semaforo: ficha.validacionesResumen.semaforo ?? undefined,
        }
      : undefined,
    aprobadaAt: ficha.aprobadaAt?.toISOString(),
    balance: ficha.balance
      ? {
          activoCorriente: ficha.balance.activoCorriente ?? undefined,
          activoNoCorriente: ficha.balance.activoNoCorriente ?? undefined,
          pasivoCorriente: ficha.balance.pasivoCorriente ?? undefined,
          pasivoNoCorriente: ficha.balance.pasivoNoCorriente ?? undefined,
          patrimonio: ficha.balance.patrimonio ?? undefined,
        }
      : undefined,
    estadoResultados: ficha.estadoResultados
      ? { utilidad: ficha.estadoResultados.utilidad ?? undefined }
      : undefined,
  };
}
