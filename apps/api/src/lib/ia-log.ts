import { registrarIaLlamada } from "@ffa/db";
import { setIaLlamadaHandler } from "@ffa/pipeline";

let registered = false;

export function initIaLlamadaLogging(): void {
  if (registered) return;
  registered = true;

  setIaLlamadaHandler(async (input) => {
    await registrarIaLlamada(input);
  });
}
