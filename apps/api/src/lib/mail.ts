import { NotificacionLogModel } from "@ffa/db";
import nodemailer from "nodemailer";
import { appConfig } from "../config.js";

const transporter = nodemailer.createTransport({
  host: appConfig.smtpHost,
  port: appConfig.smtpPort,
  secure: false,
});

export async function enviarAcuseRecepcion(opts: {
  destinatario: string;
  casoNumero: string;
  casoId: string;
  template?: string;
  documentoNombre?: string;
  estadoInicial?: string;
}): Promise<void> {
  const vars: Record<string, string> = {
    numero: opts.casoNumero,
    documento: opts.documentoNombre ?? "—",
    estado: opts.estadoInicial ?? "recibido",
  };
  let cuerpo =
    opts.template ??
    "Estimado/a cliente,\n\nRecibimos su documentación.\nCaso {{numero}}\nDocumento: {{documento}}\nEstado: {{estado}}\n\nEquipo ECR Salud";
  for (const [k, v] of Object.entries(vars)) {
    cuerpo = cuerpo.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
  }

  try {
    await transporter.sendMail({
      from: appConfig.smtpFrom,
      to: opts.destinatario,
      subject: `Acuse de recepción — Caso ${opts.casoNumero}`,
      text: cuerpo,
    });
    await NotificacionLogModel.create({
      tipo: "acuse",
      destinatario: opts.destinatario,
      casoId: opts.casoId,
      estado: "enviado",
      asunto: `Acuse ${opts.casoNumero}`,
    });
  } catch (err) {
    await NotificacionLogModel.create({
      tipo: "acuse",
      destinatario: opts.destinatario,
      casoId: opts.casoId,
      estado: "fallido",
      error: err instanceof Error ? err.message : "Error SMTP",
    });
  }
}
