import { ConfiguracionSistemaModel, NotificacionLogModel } from "@ffa/db";
import { CONFIG_SISTEMA_ID } from "@ffa/shared";
import nodemailer from "nodemailer";
import { workerConfig } from "../config.js";

const transporter = nodemailer.createTransport({
  host: workerConfig.smtpHost,
  port: workerConfig.smtpPort,
  secure: false,
});

type NotifTipo =
  | "acuse"
  | "fallo_calidad"
  | "revision_requerida"
  | "aprobacion_auto"
  | "error_critico";

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  let out = tpl;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
  }
  return out;
}

export async function enviarNotificacion(opts: {
  tipo: NotifTipo;
  destinatario: string;
  asunto: string;
  cuerpo: string;
  casoId?: string;
}): Promise<void> {
  try {
    await transporter.sendMail({
      from: workerConfig.smtpFrom,
      to: opts.destinatario,
      subject: opts.asunto,
      text: opts.cuerpo,
    });
    await NotificacionLogModel.create({
      tipo: opts.tipo,
      destinatario: opts.destinatario,
      casoId: opts.casoId,
      estado: "enviado",
      asunto: opts.asunto,
    });
  } catch (err) {
    await NotificacionLogModel.create({
      tipo: opts.tipo,
      destinatario: opts.destinatario,
      casoId: opts.casoId,
      estado: "fallido",
      asunto: opts.asunto,
      error: err instanceof Error ? err.message : "SMTP error",
    });
  }
}

async function getConfig() {
  return ConfiguracionSistemaModel.findById(CONFIG_SISTEMA_ID);
}

export async function enviarAcuseCompleto(opts: {
  destinatario: string;
  casoNumero: string;
  casoId: string;
  documentoNombre: string;
  estadoInicial: string;
}): Promise<void> {
  const config = await getConfig();
  const tpl = config?.acuseCorreoTemplate ?? "Caso {{numero}} — {{documento}} — {{estado}}";
  const cuerpo = renderTemplate(tpl, {
    numero: opts.casoNumero,
    documento: opts.documentoNombre,
    estado: opts.estadoInicial,
  });
  await enviarNotificacion({
    tipo: "acuse",
    destinatario: opts.destinatario,
    asunto: `Acuse de recepción — Caso ${opts.casoNumero}`,
    cuerpo,
    casoId: opts.casoId,
  });
}

export async function notificarFalloCalidad(opts: {
  destinatario: string;
  casoNumero: string;
  casoId: string;
}): Promise<void> {
  const config = await getConfig();
  const tpl =
    config?.notificacionFalloTemplate ??
    "No pudimos procesar el caso {{numero}}. Reenvíe con mejor calidad.";
  const cuerpo = renderTemplate(tpl, { numero: opts.casoNumero });
  await enviarNotificacion({
    tipo: "fallo_calidad",
    destinatario: opts.destinatario,
    asunto: `Documento no procesable — Caso ${opts.casoNumero}`,
    cuerpo,
    casoId: opts.casoId,
  });
}

export async function notificarRevisionAnalista(opts: {
  casoNumero: string;
  casoId: string;
  semaforo: string;
  autoListo?: boolean;
}): Promise<void> {
  const config = await getConfig();
  const destinatarios = [
    ...(config?.notificacionAnalistas ?? []),
    ...(opts.autoListo ? [] : []),
  ].filter(Boolean);

  if (!destinatarios.length) return;

  const tpl =
    config?.notificacionRevisionTemplate ??
    "Caso {{numero}} — semáforo {{semaforo}} — requiere revisión.";
  const cuerpo = renderTemplate(tpl, {
    numero: opts.casoNumero,
    semaforo: opts.semaforo,
  });

  const tipo: NotifTipo = opts.autoListo ? "aprobacion_auto" : "revision_requerida";
  const asunto = opts.autoListo
    ? `Caso ${opts.casoNumero} — elegible auto-aprobación (O.10)`
    : `Revisión requerida — Caso ${opts.casoNumero}`;

  for (const email of destinatarios) {
    await enviarNotificacion({
      tipo,
      destinatario: email,
      asunto,
      cuerpo,
      casoId: opts.casoId,
    });
  }
}

export async function notificarErrorCritico(opts: {
  casoNumero: string;
  casoId: string;
  error: string;
}): Promise<void> {
  const config = await getConfig();
  const destinatarios = config?.notificacionAdmin ?? [];
  if (!destinatarios.length) return;

  const cuerpo = `Error crítico en caso ${opts.casoNumero}:\n\n${opts.error}`;
  for (const email of destinatarios) {
    await enviarNotificacion({
      tipo: "error_critico",
      destinatario: email,
      asunto: `[FFA] Error crítico — ${opts.casoNumero}`,
      cuerpo,
      casoId: opts.casoId,
    });
  }
}
