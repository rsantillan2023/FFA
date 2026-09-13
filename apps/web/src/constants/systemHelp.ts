import type { PageHelpInfo } from "./pageInfo";
import { SYSTEM_NAME, SYSTEM_TAGLINE } from "./brand";

/** Ayuda global: qué es SOOFT FINYX y para qué sirve (no es por pantalla). */
export const SYSTEM_HELP: PageHelpInfo = {
  title: `¿Qué es ${SYSTEM_NAME} y para qué sirve?`,
  summary: `${SYSTEM_NAME} es ${SYSTEM_TAGLINE.toLowerCase()} para instituciones financieras. Procesa fichas financieras de empresas y elabora informes de crédito: recibís un balance o estado de resultados en PDF, el sistema lee los números, los clasifica según el plan contable, un analista los revisa y al final se genera el documento para el comité.`,
  whenToUse:
    "Cuando necesitás entender el propósito general del sistema, capacitar a alguien nuevo o recordar cómo encaja cada módulo en el flujo completo.",
  sections: [
    {
      title: "Las 6 etapas del flujo",
      bullets: [
        "1. Carga documental — subís el PDF o imagen y se abre el expediente.",
        "2. Procesamiento automático — extracción, normalización, clasificación y validación.",
        "3. Revisión del analista — corregís lo que el sistema leyó o clasificó mal.",
        "4. Aprobación de ficha — cierre formal con totales e indicadores.",
        "5. Archivo en repositorio — fichas aprobadas consultables por empresa y ejercicio.",
        "6. Informe de comité — documento formal para presentar al comité de crédito.",
      ],
    },
    {
      title: "Análisis adicional",
      bullets: [
        "Comparar ejercicios de la misma empresa (evolución entre períodos).",
        "Consolidar varias empresas de un grupo económico.",
        "Ver métricas del equipo en el panel de inicio.",
        "Seguir el avance de un caso en el mapa del proceso o en su expediente.",
      ],
    },
  ],
  bullets: [
    "La ℹ junto al título de cada pantalla explica solo esa pantalla.",
    "El asistente del panel izquierdo te guía hacia cada función.",
    "«Mapa del sitio» lista todos los módulos disponibles según tu rol.",
  ],
};

/** @deprecated Usar SYSTEM_HELP */
export const FFA_SYSTEM_HELP = SYSTEM_HELP;
