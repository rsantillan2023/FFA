import { AccesoFallidoModel, UserModel } from "@ffa/db";
import type { AuthUser, LoginResponse } from "@ffa/shared";
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../plugins/auth.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { email: string; password: string } }>("/auth/login", async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Credenciales inválidas" });
      }

      const { email, password } = parsed.data;
      const ip = request.ip;
      const userAgent = request.headers["user-agent"];

      async function logFallo(motivo: string): Promise<void> {
        await AccesoFallidoModel.create({
          email: email.toLowerCase(),
          ip,
          userAgent,
          motivo,
        });
      }

      const user = await UserModel.findOne({ email: email.toLowerCase(), activo: true });
      if (!user) {
        await logFallo("usuario_no_encontrado");
        return reply.code(401).send({ error: "Email o contraseña incorrectos" });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        await logFallo("password_incorrecto");
        return reply.code(401).send({ error: "Email o contraseña incorrectos" });
      }

      user.ultimoAcceso = new Date();
      await user.save();

      const authUser: AuthUser = {
        id: user._id.toString(),
        email: user.email,
        nombre: user.nombre,
        rol: user.rol,
      };

      const token = await reply.jwtSign(authUser);
      return reply.send({ token, user: authUser } satisfies LoginResponse);
    }
  );

  app.get(
    "/users/me",
    { preHandler: authenticate },
    async (request): Promise<AuthUser> => {
      return request.user;
    }
  );
}
