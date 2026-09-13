import { UserRole } from "@ffa/shared";
import type { FastifyReply, FastifyRequest } from "fastify";

export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user;
    if (!user || !roles.includes(user.rol)) {
      await reply.code(403).send({ error: "Sin permisos" });
    }
  };
}

export const adminOrPo = requireRole(UserRole.ADMIN, UserRole.PRODUCT_OWNER);
export const lecturaEquipo = requireRole(
  UserRole.ADMIN,
  UserRole.PRODUCT_OWNER,
  UserRole.ANALISTA,
  UserRole.REFERENTE,
  UserRole.SOLO_LECTURA
);
export const edicionEquipo = requireRole(
  UserRole.ADMIN,
  UserRole.PRODUCT_OWNER,
  UserRole.ANALISTA,
  UserRole.REFERENTE
);
