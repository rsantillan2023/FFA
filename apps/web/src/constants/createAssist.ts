export type CreateAssistFlowId =
  | "cargar-ficha"
  | "nuevo-contribuyente"
  | "nueva-version-plan"
  | "nuevo-usuario";

export interface CreateAssistStep {
  id: string;
  title: string;
  hint: string;
  field?: string;
}

export interface CreateAssistFlow {
  id: CreateAssistFlowId;
  title: string;
  intro: string;
  chatIntro: string;
  route: string;
  steps: CreateAssistStep[];
  examples: string[];
}

export const CREATE_ASSIST_FLOWS: Record<CreateAssistFlowId, CreateAssistFlow> = {
  "cargar-ficha": {
    id: "cargar-ficha",
    title: "Cargar una ficha nueva",
    intro: "Te guío en 4 pasos para subir PDFs o imágenes y que el sistema las procese solo.",
    chatIntro:
      "Para cargar una ficha: 1) poné un nombre de referencia (ej. Balance TGS), 2) elegí el PDF o imagen, 3) opcionalmente dejá un email para acuse, 4) apretá «Enviar a procesamiento».",
    route: "/casos",
    steps: [
      {
        id: "referencia",
        title: "Nombre de referencia",
        hint: "Cómo querés identificar la ficha en la bandeja: Balance Clínica, Balance Loma Negra, etc.",
        field: "referencia",
      },
      {
        id: "archivo",
        title: "Elegí el documento",
        hint: "Arrastrá el balance, EERR o estados IFRS (PDF, JPG o PNG). Podés subir más de uno.",
        field: "files",
      },
      {
        id: "email",
        title: "Email del remitente (opcional)",
        hint: "Solo si querés que el sistema envíe acuse de recibo al cliente.",
        field: "remitenteEmail",
      },
      {
        id: "enviar",
        title: "Enviar a procesamiento",
        hint: "El sistema extrae datos, clasifica rubros y deja la ficha lista para revisión.",
        field: "submit",
      },
    ],
    examples: [
      "Subir balance 2025 de una clínica",
      "Cargar PDF que me mandaron por correo",
      "Tengo dos fichas del mismo cliente",
    ],
  },
  "nuevo-contribuyente": {
    id: "nuevo-contribuyente",
    title: "Alta de contribuyente",
    intro: "Registrá la empresa una sola vez; después las fichas se vinculan solas por RUT.",
    chatIntro:
      "Para dar de alta un contribuyente: completá RUT (si lo tenés), razón social obligatoria y alias opcionales. Guardá y ya podés cargar fichas de esa empresa.",
    route: "/contribuyentes",
    steps: [
      {
        id: "rut",
        title: "RUT de la empresa",
        hint: "Formato 76123456-7. Si no lo tenés aún, podés dejarlo vacío y completarlo después.",
        field: "rut",
      },
      {
        id: "razon",
        title: "Razón social",
        hint: "Nombre legal tal como figura en la ficha financiera. Es el dato más importante.",
        field: "razonSocial",
      },
      {
        id: "alias",
        title: "Nombres alternativos (opcional)",
        hint: "Siglas o marcas comerciales separadas por coma — ayudan al buscador.",
        field: "alt",
      },
      {
        id: "guardar",
        title: "Guardar",
        hint: "Con esto la empresa queda disponible en directorio, bandeja y repositorio.",
        field: "submit",
      },
    ],
    examples: [
      "Agregar clínica sin RUT todavía",
      "Registrar holding con varios nombres comerciales",
      "Alta de transportes del sur rut 78345678-9",
    ],
  },
  "nueva-version-plan": {
    id: "nueva-version-plan",
    title: "Nueva versión del plan contable",
    intro: "Creá una versión semver, importá CSV si hace falta y aprobala cuando esté lista.",
    chatIntro:
      "Nueva versión del plan: indicá número semver (ej. 1.1.0), notas breves y creá. Luego importá rubros CSV o editá desde la misma pantalla.",
    route: "/admin/plan-cuentas",
    steps: [
      {
        id: "version",
        title: "Número de versión",
        hint: "Usá formato semver: 1.0.0, 1.1.0, 2.0.0 según el cambio normativo.",
        field: "version",
      },
      {
        id: "notas",
        title: "Notas del cambio",
        hint: "Una línea clara: qué rubros se agregaron o qué norma motivó la versión.",
        field: "notas",
      },
      {
        id: "crear",
        title: "Crear versión",
        hint: "Después podés importar CSV de rubros y solicitar aprobación institucional.",
        field: "submit",
      },
    ],
    examples: [
      "Plan 2.0 por nueva norma IFRS",
      "Versión 1.1 con rubros de salud",
      "Duplicar plan vigente con ajustes menores",
    ],
  },
  "nuevo-usuario": {
    id: "nuevo-usuario",
    title: "Nuevo usuario interno",
    intro: "Creá cuentas para analistas, referentes o administradores del equipo.",
    chatIntro:
      "Usuario nuevo: email institucional, nombre visible, contraseña inicial y rol. El analista trabaja fichas; referente consulta; admin configura.",
    route: "/admin/usuarios",
    steps: [
      {
        id: "email",
        title: "Email institucional",
        hint: "Será el usuario de login, ej. nombre.apellido@ecr-salud.local",
        field: "email",
      },
      {
        id: "nombre",
        title: "Nombre completo",
        hint: "Aparece en asignaciones y auditoría.",
        field: "nombre",
      },
      {
        id: "rol",
        title: "Rol y contraseña",
        hint: "Elegí el rol acorde al trabajo. Contraseña inicial — el usuario puede cambiarla después.",
        field: "rol",
      },
      {
        id: "crear",
        title: "Crear usuario",
        hint: "Verificá el email antes de guardar; no se puede reutilizar.",
        field: "submit",
      },
    ],
    examples: [
      "Alta analista para revisión de fichas",
      "Usuario solo lectura para auditoría",
      "Nuevo admin de configuración",
    ],
  },
};

export function getCreateAssistFlow(id: CreateAssistFlowId): CreateAssistFlow {
  return CREATE_ASSIST_FLOWS[id];
}
