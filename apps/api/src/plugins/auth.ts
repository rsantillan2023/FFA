import type { AuthUser } from "@ffa/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

export async function registerAuth(app: FastifyInstance, secret: string): Promise<void> {
  await app.register(import("@fastify/jwt"), { secret });
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({ error: "No autorizado" });
  }
}
