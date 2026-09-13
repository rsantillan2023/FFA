import { CasoModel } from "@ffa/db";

import { UserRole } from "@ffa/shared";

import type { FastifyReply, FastifyRequest } from "fastify";



/** S.8 — verifica que el usuario autenticado puede acceder al caso/contribuyente. */

export async function verificarAccesoCaso(

  request: FastifyRequest,

  reply: FastifyReply,

  casoId: string

): Promise<boolean> {

  const user = request.user;

  if (!user) {

    await reply.code(401).send({ error: "No autenticado" });

    return false;

  }



  const rol = user.rol;
  if (rol === UserRole.ADMIN || rol === UserRole.PRODUCT_OWNER || rol === UserRole.ANALISTA) {
    return true;
  }



  const caso = await CasoModel.findById(casoId).select("asignadoA contribuyenteId");

  if (!caso) {

    await reply.code(404).send({ error: "Caso no encontrado" });

    return false;

  }



  const asignado = caso.asignadoA?.toString();

  if (user.rol === UserRole.REFERENTE || user.rol === UserRole.SOLO_LECTURA) {

    if (asignado && asignado !== user.id) {

      await reply.code(403).send({ error: "Sin acceso a este caso/contribuyente" });

      return false;

    }

  }



  return true;

}


