import type { FastifyInstance } from "fastify";

/** Q.11 — ingesta por correo sin cuenta de usuario. */
export async function ingestaRoutes(app: FastifyInstance): Promise<void> {
  app.get("/ingesta/email", async () => ({
    canal: "email",
    requiereCuenta: false,
    descripcion:
      "Los documentos enviados por correo al buzón configurado se procesan automáticamente sin registro previo.",
    acuseAutomatico: true,
  }));
}
