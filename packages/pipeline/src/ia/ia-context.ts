export interface IaContext {
  actorTipo: "sistema" | "usuario";
  actorId?: string;
  casoId?: string;
  documentoId?: string;
  documentoNombre?: string;
  /** true cuando Claude actúa como respaldo tras fallo de OpenAI */
  esRespaldoAnthropic?: boolean;
}

let currentContext: IaContext | null = null;

export function runWithIaContext<T>(ctx: IaContext, fn: () => Promise<T>): Promise<T> {
  const prev = currentContext;
  currentContext = { ...prev, ...ctx };
  return fn().finally(() => {
    currentContext = prev;
  });
}

export function getIaContext(): IaContext | null {
  return currentContext;
}
