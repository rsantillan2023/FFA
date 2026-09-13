import type { CreateAssistFlow, CreateAssistFlowId } from "../constants/createAssist";
import { getCreateAssistFlow } from "../constants/createAssist";

export interface AssistInterpretation {
  stepIndex: number;
  message: string;
  field?: string;
}

export function interpretCreatePhrase(
  phrase: string,
  flowId: CreateAssistFlowId,
  context: Record<string, unknown> = {},
): AssistInterpretation | null {
  const q = phrase.trim().toLowerCase();
  if (q.length < 3) return null;

  const flow = getCreateAssistFlow(flowId);

  if (flowId === "cargar-ficha") {
    if (/correo|email|acuse|remitente/.test(q)) {
      return {
        stepIndex: 2,
        message: "Paso 3: completá el email del remitente si querés acuse automático.",
        field: "remitenteEmail",
      };
    }
    if (/nombre|referencia|identificar|llamar|tgs|clínica|clinica|loma/.test(q)) {
      return {
        stepIndex: 0,
        message: "Poné un nombre de referencia para reconocer la ficha en la bandeja.",
        field: "referencia",
      };
    }
    if (/varios|dos|múltiples|multiple|lote/.test(q)) {
      return {
        stepIndex: 1,
        message: "Podés elegir varios archivos a la vez en el recuadro de carga.",
        field: "files",
      };
    }
    if (/pdf|imagen|foto|balance|eerr|estado|ifrs|subir|cargar|archivo/.test(q)) {
      const hasRef = String(context.referencia ?? "").trim().length >= 2;
      return {
        stepIndex: hasRef ? 1 : 0,
        message: hasRef
          ? "Arrastrá el PDF o la imagen de la ficha al recuadro punteado."
          : "Primero poné un nombre de referencia; después elegí el archivo.",
        field: hasRef ? "files" : "referencia",
      };
    }
    if (/enviar|procesar|mandar/.test(q)) {
      const hasRef = String(context.referencia ?? "").trim().length >= 2;
      const hasFiles = Number(context.filesCount ?? 0) > 0;
      if (!hasRef) {
        return {
          stepIndex: 0,
          message: "Falta el nombre de referencia antes de enviar.",
          field: "referencia",
        };
      }
      return {
        stepIndex: hasFiles ? 3 : 1,
        message: hasFiles
          ? "Ya tenés archivos — apretá «Enviar a procesamiento»."
          : "Elegí al menos un archivo; después enviá a procesamiento.",
        field: hasFiles ? "submit" : "files",
      };
    }
  }

  if (flowId === "nuevo-contribuyente") {
    const rutMatch = q.match(/\d{7,8}[-]?[\dkK]/);
    if (rutMatch) {
      return {
        stepIndex: 0,
        message: `Detecté un RUT — pegalo en el campo RUT (${rutMatch[0]}).`,
        field: "rut",
      };
    }
    if (/sin rut|no tengo rut|todavía no/.test(q)) {
      return {
        stepIndex: 1,
        message: "No hay problema: dejá el RUT vacío y completá la razón social.",
        field: "razonSocial",
      };
    }
    if (/razón|razon|nombre|empresa|holding|clínica|clinica/.test(q)) {
      return {
        stepIndex: 1,
        message: "Completá la razón social tal como figura en la documentación.",
        field: "razonSocial",
      };
    }
    if (/alias|alternativ|comercial|sigla/.test(q)) {
      return {
        stepIndex: 2,
        message: "Agregá nombres alternativos separados por coma (opcional).",
        field: "alt",
      };
    }
  }

  if (flowId === "nueva-version-plan") {
    const verMatch = q.match(/\d+\.\d+\.\d+/);
    if (verMatch) {
      return {
        stepIndex: 0,
        message: `Usá la versión ${verMatch[0]} en el campo semver.`,
        field: "version",
      };
    }
    if (/csv|import|rubro/.test(q)) {
      return {
        stepIndex: 2,
        message: "Primero creá la versión; después importá el CSV de rubros en la misma pantalla.",
        field: "submit",
      };
    }
    if (/nota|cambio|norma|ifrs/.test(q)) {
      return {
        stepIndex: 1,
        message: "Describí brevemente el motivo del cambio en «Notas».",
        field: "notas",
      };
    }
  }

  if (flowId === "nuevo-usuario") {
    if (/analista|revis/.test(q)) {
      return {
        stepIndex: 2,
        message: "Para quien revisa fichas, elegí rol «Analista».",
        field: "rol",
      };
    }
    if (/admin|configur/.test(q)) {
      return {
        stepIndex: 2,
        message: "Para configuración del sistema, elegí rol «Admin».",
        field: "rol",
      };
    }
    if (/solo lectura|auditor|consulta/.test(q)) {
      return {
        stepIndex: 2,
        message: "Acceso de consulta: rol «Solo lectura».",
        field: "rol",
      };
    }
    if (/email|correo|@/.test(q)) {
      return {
        stepIndex: 0,
        message: "El email institucional será el nombre de usuario para ingresar.",
        field: "email",
      };
    }
  }

  return {
    stepIndex: inferStepFromContext(flow, context),
    message: `Te sugiero seguir: «${flow.steps[inferStepFromContext(flow, context)]?.title ?? "primer paso"}».`,
  };
}

function inferStepFromContext(flow: CreateAssistFlow, context: Record<string, unknown>): number {
  for (let i = 0; i < flow.steps.length; i++) {
    const step = flow.steps[i]!;
    if (step.field && context[step.field]) continue;
    if (step.field === "submit") {
      const priorOk = flow.steps.slice(0, i).every((s) => !s.field || s.field === "submit" || context[s.field]);
      return priorOk ? i : Math.max(0, i - 1);
    }
    return i;
  }
  return flow.steps.length - 1;
}

export function inferActiveStep(flowId: CreateAssistFlowId, context: Record<string, unknown>): number {
  return inferStepFromContext(getCreateAssistFlow(flowId), context);
}
