import { CasoModel } from "@ffa/db";

export async function assertCasoNoPausado(casoId: string): Promise<void> {
  const caso = await CasoModel.findById(casoId).select("procesamientoPausado numero");
  if (caso?.procesamientoPausado) {
    throw new Error(`Caso ${caso.numero} pausado — reanude para continuar (O.11)`);
  }
}
