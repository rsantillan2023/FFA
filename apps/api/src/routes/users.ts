import { UserModel } from "@ffa/db";
import { UserRole, type UserDto } from "@ffa/shared";
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../plugins/auth.js";
import { adminOrPo } from "../plugins/rbac.js";

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  nombre: z.string().min(1),
  rol: z.enum([
    UserRole.ADMIN,
    UserRole.ANALISTA,
    UserRole.REFERENTE,
    UserRole.SOLO_LECTURA,
    UserRole.PRODUCT_OWNER,
  ]),
});

const patchUserSchema = z.object({
  nombre: z.string().min(1).optional(),
  rol: z
    .enum([
      UserRole.ADMIN,
      UserRole.ANALISTA,
      UserRole.REFERENTE,
      UserRole.SOLO_LECTURA,
      UserRole.PRODUCT_OWNER,
    ])
    .optional(),
  activo: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

function mapUser(u: {
  _id: { toString(): string };
  email: string;
  nombre: string;
  rol: string;
  activo: boolean;
  ultimoAcceso?: Date | null;
  createdAt: Date;
}): UserDto {
  return {
    id: u._id.toString(),
    email: u.email,
    nombre: u.nombre,
    rol: u.rol,
    activo: u.activo,
    ultimoAcceso: u.ultimoAcceso?.toISOString(),
    createdAt: u.createdAt.toISOString(),
  };
}

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  app.get("/users", { preHandler: [authenticate, adminOrPo] }, async () => {
    const users = await UserModel.find().sort({ nombre: 1 });
    return users.map(mapUser);
  });

  app.post("/users", { preHandler: [authenticate, adminOrPo] }, async (request, reply) => {
    const parsed = createUserSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Datos inválidos" });

    const exists = await UserModel.findOne({ email: parsed.data.email.toLowerCase() });
    if (exists) return reply.code(409).send({ error: "Email ya registrado" });

    const user = await UserModel.create({
      email: parsed.data.email.toLowerCase(),
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
      nombre: parsed.data.nombre,
      rol: parsed.data.rol,
      activo: true,
    });

    return reply.code(201).send(mapUser(user));
  });

  app.patch("/users/:id", { preHandler: [authenticate, adminOrPo] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = patchUserSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Datos inválidos" });

    const user = await UserModel.findById(id);
    if (!user) return reply.code(404).send({ error: "Usuario no encontrado" });

    if (parsed.data.nombre) user.nombre = parsed.data.nombre;
    if (parsed.data.rol) user.rol = parsed.data.rol;
    if (parsed.data.activo != null) user.activo = parsed.data.activo;
    if (parsed.data.password) {
      user.passwordHash = await bcrypt.hash(parsed.data.password, 10);
    }
    await user.save();

    return mapUser(user);
  });
}
