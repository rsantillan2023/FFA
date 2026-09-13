import {
  DocumentoFuenteModel,
  crearCaso,
  transicionarCaso,
} from "@ffa/db";
import { CanalRecepcion, CasoEstado } from "@ffa/shared";
import { createHash } from "node:crypto";
import { Types } from "mongoose";
import { enqueuePreprocess } from "../lib/enqueue.js";
import { enviarAcuseCompleto } from "../lib/notificaciones.js";
import { uploadBuffer } from "../lib/storage.js";
import { workerConfig } from "../config.js";

interface MailhogMessage {
  ID: string;
  From: { Mailbox: string; Domain: string };
  Content: {
    Headers: Record<string, string[]>;
  };
}

interface MailhogList {
  items: MailhogMessage[];
}

const processedIds = new Set<string>();

export async function pollMailhogIngest(): Promise<number> {
  let ingested = 0;
  try {
    const res = await fetch(`${workerConfig.mailhogApi}/messages?limit=50`);
    if (!res.ok) return 0;
    const data = (await res.json()) as MailhogList;

    for (const msg of data.items ?? []) {
      if (processedIds.has(msg.ID)) continue;

      const from = `${msg.From.Mailbox}@${msg.From.Domain}`;
      const subject = msg.Content.Headers.Subject?.[0] ?? "Sin asunto";

      const rawRes = await fetch(`${workerConfig.mailhogApi}/messages/${msg.ID}`);
      if (!rawRes.ok) continue;
      const raw = (await rawRes.json()) as MailhogMessage & {
        MIME?: { Parts?: { Headers: Record<string, string[]>; Body: string }[] };
      };

      const parts = raw.MIME?.Parts ?? [];
      const loteId = new Types.ObjectId();
      let hasAttachment = false;
      const attachmentNames: string[] = [];

      for (const part of parts) {
        const disposition = part.Headers["Content-Disposition"]?.[0] ?? "";
        const contentType = part.Headers["Content-Type"]?.[0] ?? "application/octet-stream";
        if (!disposition.includes("attachment") && !contentType.includes("pdf")) continue;

        const filenameMatch = disposition.match(/filename="?([^";]+)"?/);
        const filename = filenameMatch?.[1] ?? "adjunto.pdf";
        const buffer = Buffer.from(part.Body, "base64");

        if (buffer.length < 100) continue;
        hasAttachment = true;
        attachmentNames.push(filename);

        try {
          const referenciaCorreo =
            attachmentNames.length === 1
              ? subject.trim() || filename.replace(/\.[^.]+$/, "")
              : `${subject.trim() || "Correo"} · ${filename.replace(/\.[^.]+$/, "")}`;

          const caso = await crearCaso({
            canal: CanalRecepcion.CORREO,
            loteId: loteId.toString(),
            referencia: referenciaCorreo,
          });
          const hash = createHash("sha256").update(buffer).digest("hex");

          const documento = await DocumentoFuenteModel.create({
            casoId: caso._id,
            nombreOriginal: filename,
            mimeType: contentType.split(";")[0],
            storageKey: "pending",
            hashSha256: hash,
            canal: CanalRecepcion.CORREO,
            recepcion: {
              at: new Date(),
              remitente: from,
              asunto: subject,
              messageId: msg.ID,
            },
          });

          documento.storageKey = await uploadBuffer(
            caso._id.toString(),
            documento._id.toString(),
            filename,
            buffer,
            documento.mimeType
          );
          await documento.save();

          await transicionarCaso(caso._id.toString(), CasoEstado.EN_COLA);
          await enqueuePreprocess(caso._id.toString(), documento._id.toString());
          await enviarAcuseCompleto({
            destinatario: from,
            casoNumero: caso.numero,
            casoId: caso._id.toString(),
            documentoNombre: filename,
            estadoInicial: "recibido",
          });
          ingested++;
        } catch (e) {
          console.warn(
            `[mailhog] adjunto omitido ${filename}:`,
            e instanceof Error ? e.message : e
          );
        }
      }

      if (hasAttachment || parts.length === 0) {
        processedIds.add(msg.ID);
      }
    }
  } catch {
    // Mailhog no disponible — ignorar en dev
  }
  return ingested;
}
