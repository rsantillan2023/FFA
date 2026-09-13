import { CasoModel } from "@ffa/db";
import { Types } from "mongoose";

/** Resuelve un expediente por ObjectId o por número de ficha (ej. FFA-2026-DEMO-14). */
export async function resolveCasoId(idOrNumero: string): Promise<string> {
  const trimmed = idOrNumero.trim();
  if (!trimmed) {
    throw new Error("Ingresá el número de ficha o el ID del expediente");
  }

  if (Types.ObjectId.isValid(trimmed) && String(new Types.ObjectId(trimmed)) === trimmed) {
    const byId = await CasoModel.findById(trimmed).select("_id");
    if (byId) return byId._id.toString();
  }

  const byNumero = await CasoModel.findOne({ numero: trimmed }).select("_id");
  if (byNumero) return byNumero._id.toString();

  throw new Error(`No se encontró ficha con número o ID «${trimmed}»`);
}
