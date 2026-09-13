import {
  DocumentoFuenteModel,
  crearCaso,
  transicionarCaso,
} from "@ffa/db";
import { CanalRecepcion, CasoEstado } from "@ffa/shared";
import { createHash } from "node:crypto";
import { Types } from "mongoose";
import { enqueuePreprocess } from "./enqueue.js";
import { enviarAcuseCompleto } from "./notificaciones.js";
import { uploadBuffer } from "./storage.js";
/** Ingesta IMAP real cuando EMAIL_IMAP_HOST está configurado (complementa Mailhog en dev). */
export async function pollImapIngest(): Promise<number> {
  const host = process.env.EMAIL_IMAP_HOST;
  if (!host) return 0;

  let ingested = 0;
  try {
    const { ImapFlow } = await import("imapflow");
    const client = new ImapFlow({
      host,
      port: Number(process.env.EMAIL_IMAP_PORT ?? 993),
      secure: process.env.EMAIL_IMAP_SECURE !== "false",
      auth: {
        user: process.env.EMAIL_IMAP_USER ?? "",
        pass: process.env.EMAIL_IMAP_PASSWORD ?? "",
      },
    });

    await client.connect();
    const lock = await client.getMailboxLock(process.env.EMAIL_IMAP_FOLDER ?? "INBOX");
    try {
      for await (const msg of client.fetch("1:*", {
        envelope: true,
        source: true,
        uid: true,
      })) {
        const from = msg.envelope?.from?.[0];
        const remitente = from?.address ?? "desconocido@local";
        const subject = msg.envelope?.subject ?? "Sin asunto";
        const messageId = msg.envelope?.messageId ?? String(msg.uid);

        const dup = await DocumentoFuenteModel.findOne({ "recepcion.messageId": messageId });
        if (dup) continue;

        const source = msg.source;
        if (!source) continue;

        const raw = source.toString("utf-8");
        const loteId = new Types.ObjectId();
        const attachments = extractAttachmentsFromRaw(raw);

        for (const att of attachments) {
          if (att.buffer.length < 100) continue;

          try {
            const base = att.filename.replace(/\.[^.]+$/, "");
            const referenciaCorreo =
              attachments.length === 1
                ? subject.trim() || base
                : `${subject.trim() || "Correo"} · ${base}`;

            const caso = await crearCaso({
              canal: CanalRecepcion.CORREO,
              loteId: loteId.toString(),
              referencia: referenciaCorreo,
            });
            const hash = createHash("sha256").update(att.buffer).digest("hex");

            const documento = await DocumentoFuenteModel.create({
              casoId: caso._id,
              nombreOriginal: att.filename,
              mimeType: att.mimeType,
              storageKey: "pending",
              hashSha256: hash,
              canal: CanalRecepcion.CORREO,
              recepcion: {
                at: new Date(),
                remitente,
                asunto: subject,
                messageId,
              },
            });

            documento.storageKey = await uploadBuffer(
              caso._id.toString(),
              documento._id.toString(),
              att.filename,
              att.buffer,
              att.mimeType
            );
            await documento.save();

            await transicionarCaso(caso._id.toString(), CasoEstado.EN_COLA);
            await enqueuePreprocess(caso._id.toString(), documento._id.toString());
            await enviarAcuseCompleto({
              destinatario: remitente,
              casoNumero: caso.numero,
              casoId: caso._id.toString(),
              documentoNombre: att.filename,
              estadoInicial: "recibido",
            });
            ingested++;
          } catch (e) {
            console.warn(
              `[imap] adjunto omitido ${att.filename}:`,
              e instanceof Error ? e.message : e
            );
          }
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    console.warn("[imap] ingest skip:", e instanceof Error ? e.message : e);
  }
  return ingested;
}

function extractAttachmentsFromRaw(raw: string): {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}[] {
  const out: { filename: string; mimeType: string; buffer: Buffer }[] = [];
  const parts = raw.split(/\r?\n--/);
  for (const part of parts) {
    if (!part.includes("Content-Disposition") || !part.includes("attachment")) continue;
    const fnMatch = part.match(/filename="?([^";\r\n]+)"?/i);
    const ctMatch = part.match(/Content-Type:\s*([^\r\n;]+)/i);
    const idx = part.indexOf("\r\n\r\n");
    if (idx < 0) continue;
    const body = part.slice(idx + 4).replace(/\r\n--.*$/s, "").trim();
    try {
      const buffer = Buffer.from(body, "base64");
      out.push({
        filename: fnMatch?.[1] ?? "adjunto.pdf",
        mimeType: (ctMatch?.[1] ?? "application/pdf").trim(),
        buffer,
      });
    } catch {
      /* skip malformed part */
    }
  }
  return out;
}
