import {
  CARGA_PIPELINE_SUMMARY,
  FICHA_INPUTS_CATALOG,
  INFORME_INPUTS_CATALOG,
} from "./dataCatalog";

export interface PageHelpSection {
  title: string;
  bullets: string[];
}

export interface PageHelpInfo {
  title: string;
  summary: string;
  bullets?: string[];
  whenToUse?: string;
  sections?: PageHelpSection[];
}

export interface PageMeta {
  title: string;
  subtitle: string;
  help: PageHelpInfo;
}

export const PAGE_INFO: Record<string, PageMeta> = {
  dashboard: {
    title: "Tu panel de inicio",
    subtitle: "Qué tenés pendiente, cómo va el equipo y por dónde empezar.",
    help: {
      title: "¿Para qué sirve esta pantalla?",
      summary:
        "Es la pantalla de arranque del analista. Resume cuántas fichas hay en curso, cuántas te esperan para revisar, cuántas ya tienen informe y si el sistema está respondiendo bien. No hace falta interpretar códigos técnicos: cada número indica una tarea o un resultado del trabajo diario.",
      whenToUse:
        "Al comenzar la jornada, para decidir si entrás a la bandeja de fichas, al mapa del proceso o al archivo de fichas ya cerradas.",
      sections: [
        {
          title: "Qué significa cada bloque",
          bullets: [
            "Fichas en el sistema — total de expedientes activos o recientes.",
            "Esperando tu revisión — casos que necesitan un analista ahora.",
            "Fichas cerradas / Informes listos — trabajo ya aprobado o con informe generado.",
            "Tiempo hasta cerrar una ficha — qué tan rápido se completa el ciclo.",
            "Calidad del trabajo — cuántas fichas cuadran bien y cuántas alertas quedaron resueltas.",
          ],
        },
        {
          title: "Accesos recomendados",
          bullets: [
            "Bandeja de fichas — cargar documentos o retomar un expediente.",
            "Mapa del proceso — entender en qué etapa está cada ficha.",
            "Archivo de fichas aprobadas — consultar resultados ya cerrados.",
          ],
        },
      ],
      bullets: [
        "Accesos rápidos a las tareas más frecuentes.",
        "Resumen del trabajo del equipo en lenguaje operativo.",
        "Indicador de conexión con el sistema (arriba a la derecha).",
        "Resumen para compartir — solo admin/PO: vista previa del tablero, descarga Excel/JSON o copiar texto para correos.",
      ],
    },
  },
  casos: {
    title: "Bandeja de fichas y carga de documentos",
    subtitle: "Subí fichas financieras, seguí el procesamiento y entrá a revisar cada una.",
    help: {
      title: "¿Para qué sirve la bandeja de fichas?",
      summary:
        "Acá gestionás todo el ciclo documental: cargás PDFs o imágenes de fichas, ves el estado de procesamiento de cada expediente y accedés a la revisión cuando el sistema termina de extraer los datos.",
      whenToUse: "Cuando recibís documentación de un cliente o querés buscar y dar seguimiento a una ficha en curso.",
      sections: [CARGA_PIPELINE_SUMMARY],
      bullets: [
        "Cargar documentos (PDF, JPEG, PNG) para procesamiento automático.",
        "Filtrar por estado, semáforo de confianza o cola de revisión.",
        "Buscar fichas o contribuyentes por empresa, RUT o número.",
        "Entrar a revisión, expediente o informe desde cada fila de la tabla.",
      ],
    },
  },
  revision: {
    title: "Revisión de datos extraídos",
    subtitle: "Validá y corregí los valores que el sistema leyó de la ficha financiera.",
    help: {
      title: "Datos de la ficha: origen y carga en el sistema",
      summary:
        "La ficha canónica no se tipea en un formulario único: se construye a partir del documento cargado, el procesamiento automático, la configuración institucional y la aprobación del analista. A continuación se detalla qué insumos intervienen y en qué pantalla o proceso se cargan o generan.",
      whenToUse:
        "Antes de aprobar una ficha, para verificar que existen contribuyente, rubros, validaciones e indicadores necesarios.",
      sections: FICHA_INPUTS_CATALOG,
      bullets: [
        "Vista dividida: documento fuente y datos extraídos lado a lado.",
        "Edición de rubros, montos y confirmación de inconsistencias por línea.",
        "Semáforo y nivel de confianza global del caso.",
        "Aprobar la ficha: consolida totales e indicadores automáticamente.",
      ],
    },
  },
  informe: {
    title: "Informe para comité de crédito",
    subtitle: "Generá, editá y exportá el informe formal a partir de la ficha aprobada.",
    help: {
      title: "Lógica de generación del informe de comité",
      summary:
        "La generación del informe es el paso 6 del flujo de SOOFT FINYX. No utiliza únicamente la ficha: combina la ficha canónica aprobada con datos del caso, del contribuyente, indicadores precalculados, trazabilidad documental, inconsistencias registradas y la plantilla institucional vigente. El resultado es un documento HTML preliminar que el analista completa antes de finalizarlo.",
      whenToUse:
        "Cuando el caso y la ficha se encuentran aprobados y se requiere el documento formal para presentación al comité de crédito.",
      sections: [
        {
          title: "Requisitos previos",
          bullets: [
            "Ficha canónica en estado aprobado (con balance, estado de resultados y líneas validadas).",
            "Caso asociado en estado aprobado.",
            "Plantilla de informe vigente configurada en el sistema.",
          ],
        },
        {
          title: "Datos de entrada (además de la ficha)",
          bullets: [
            "Caso: número identificador y ejercicio o período fiscal.",
            "Contribuyente: razón social vinculada a la ficha.",
            "Indicadores financieros precalculados al aprobar la revisión (liquidez, endeudamiento, etc.).",
            "Líneas contables con trazabilidad: cada valor referenciado al documento fuente y página de origen.",
            "Inconsistencias del caso: validaciones no superadas, con indicación de confirmación por analista.",
            "Plantilla institucional vigente: define secciones y formato del informe HTML.",
            "Usuario generador: registrado en auditoría junto con la versión del plan de cuentas aplicado.",
          ],
        },
        {
          title: "Proceso de generación",
          bullets: [
            "Verifica que la ficha y el caso estén aprobados y que exista plantilla vigente.",
            "Consulta en paralelo la ficha, la plantilla y los indicadores asociados.",
            "Construye tablas de balance resumido, indicadores, detalle con trazabilidad e inconsistencias.",
            "Completa la plantilla HTML con número de caso, contribuyente, período, tablas, fecha y versión de ficha.",
            "Inicializa los apartados de análisis y recomendación como pendientes de redacción manual.",
            "Almacena el HTML, crea el registro en estado preliminar y actualiza el caso a informe generado.",
          ],
        },
        {
          title: "Intervención posterior del analista",
          bullets: [
            "Completar apartado de análisis y recomendación (obligatorios para marcar como final).",
            "Revisar el informe HTML y exportar a Word si corresponde.",
            "Marcar el informe como final una vez validados los apartados obligatorios.",
          ],
        },
        ...INFORME_INPUTS_CATALOG,
      ],
      bullets: [
        "Generar informe preliminar desde la ficha aprobada.",
        "Editar apartados manuales del analista.",
        "Exportar a HTML o Word y marcar como final.",
      ],
    },
  },
  repositorio: {
    title: "Archivo de fichas aprobadas",
    subtitle: "Consultá fichas e informes ya aprobados, por contribuyente y ejercicio.",
    help: {
      title: "¿Para qué sirve el repositorio?",
      summary:
        "Es el archivo histórico de fichas e informes que ya pasaron por revisión y aprobación. Sirve para consultar resultados anteriores sin entrar a la bandeja de fichas activas.",
      whenToUse: "Cuando buscás una ficha de un ejercicio pasado o querés comparar o consolidar datos ya aprobados.",
      bullets: [
        "Buscar por RUT, razón social o ejercicio fiscal.",
        "Ver fichas e informes aprobados por contribuyente.",
        "Acceder a comparación histórica o consolidación desde acá.",
        "Descargar o revisar documentos finales archivados.",
      ],
    },
  },
  comparacion: {
    title: "Comparar ejercicios de un contribuyente",
    subtitle: "Busque la empresa por RUT o razón social — no necesita el ID interno.",
    help: {
      title: "¿Para qué sirve la comparación histórica?",
      summary:
        "Permite ver lado a lado los indicadores de dos o más ejercicios del mismo contribuyente, destacando variaciones relevantes para el análisis crediticio.",
      whenToUse: "Cuando evaluás la evolución financiera de un cliente entre períodos consecutivos.",
      bullets: [
        "Buscar la empresa por RUT o razón social en la lista (sin pegar IDs técnicos).",
        "Elegir el ejercicio a comparar desde la línea de tiempo de fichas aprobadas.",
        "Ver diferencias por rubro e indicadores clave.",
        "Identificar tendencias de crecimiento o deterioro.",
        "Partir desde el repositorio con el enlace «Comparar» ya preseleccionado.",
      ],
    },
  },
  consolidacion: {
    title: "Consolidar varias empresas del grupo",
    subtitle: "Cuatro pasos: nombre → elegir fichas → revisar → ver totales del grupo.",
    help: {
      title: "¿Para qué sirve la consolidación multi-empresa?",
      summary:
        "Agregá fichas aprobadas de empresas vinculadas (matriz, filiales, relacionadas) para obtener una vista consolidada del grupo económico.",
      whenToUse: "Cuando el análisis crediticio requiere ver el grupo completo y no solo una empresa aislada.",
      bullets: [
        "Paso 1: poner un nombre al análisis (ej. holding 2024).",
        "Paso 2: marcar entre 2 y 12 fichas del archivo — no hace falta conocer IDs internos.",
        "Paso 3: revisar empresas y ejercicios incluidos.",
        "Paso 4: ver totales consolidados e indicadores promedio del grupo.",
        "Todas las fichas deben compartir el mismo plan de cuentas.",
      ],
    },
  },
  contribuyentes: {
    title: "Directorio de empresas y personas",
    subtitle: "Alta, búsqueda y nombres alternativos para identificar contribuyentes.",
    help: {
      title: "¿Para qué sirve el directorio de contribuyentes?",
      summary:
        "Es el registro maestro de empresas y personas que intervienen en los casos. Los datos cargados acá (RUT, razón social, alias) alimentan la ficha y el informe: se usan para vincular casos automáticamente al extraer el RUT del documento, y para identificar al contribuyente en el informe de comité.",
      whenToUse: "Antes de cargar un caso nuevo o cuando el sistema no reconoce un RUT o razón social.",
      sections: [
        {
          title: "Datos que aporta al flujo de SOOFT FINYX",
          bullets: [
            "RUT y razón social — Aparecen en ficha e informe vía vinculación al caso.",
            "Denominaciones alternativas — Mejoran el reconocimiento al extraer nombres comerciales del PDF.",
            "Vinculación automática — Si el documento trae un RUT registrado, el worker asigna el contribuyente en normalización.",
          ],
        },
      ],
      bullets: [
        "Dar de alta contribuyentes con RUT y razón social.",
        "Registrar denominaciones alternativas (nombre comercial, siglas).",
        "Buscar por RUT o texto en la razón social.",
        "Base para vincular casos, fichas e informes a la entidad correcta.",
      ],
    },
  },
  admin: {
    title: "Centro de configuración",
    subtitle: "Accesos a plan de cuentas, usuarios y parámetros globales del sistema.",
    help: {
      title: "¿Para qué sirve el centro de configuración?",
      summary:
        "Pantalla índice de administración. Desde acá accedés a herramientas que alimentan la ficha y el informe a nivel global: plan contable, umbral de confianza y parámetros del motor de extracción.",
      whenToUse: "Cuando tenés rol de administrador y necesitás configurar el sistema o dar acceso a otros usuarios.",
      sections: [
        {
          title: "Parámetros globales que alimentan ficha e informe",
          bullets: [
            "Umbral de confianza — Define cuándo un caso requiere revisión humana (editable en esta pantalla).",
            "Plan de cuentas vigente — Enlace al módulo Plan contable; requisito para clasificar y armar totales.",
            "Plantilla de informe, reglas e indicadores vigentes — Configuración inicial del sistema (seed/admin técnico; sin pantalla dedicada en el menú).",
            "Proveedor de extracción — OpenAI es el principal; Anthropic (Claude) actúa como respaldo automático si falla la lectura.",
          ],
        },
      ],
      bullets: [
        "Plan de cuentas institucional y sus versiones.",
        "Usuarios internos y asignación de roles.",
        "Parámetros globales como umbral de confianza.",
        "Operación técnica: colas y reprocesamiento.",
      ],
    },
  },
  "plan-cuentas": {
    title: "Plan contable institucional",
    subtitle: "Gestioná versiones del plan, rubros contables y su aprobación formal.",
    help: {
      title: "¿Para qué sirve el plan de cuentas?",
      summary:
        "Define la estructura contable que SOOFT FINYX usa para clasificar los datos extraídos de las fichas. Cada versión aprobada se aplica automáticamente a los casos en clasificación: sin un plan vigente, no hay rubros ni totales de ficha.",
      whenToUse: "Cuando hay cambios normativos, nuevos rubros o una nueva versión del plan contable de la institución.",
      sections: [
        {
          title: "Datos que aporta a la ficha",
          bullets: [
            "Rubros institucionales (código, nombre, activo/pasivo/patrimonio/resultados) — Clasificación de cada línea contable.",
            "Convención de signo y corriente/no corriente — Cálculo de totales de balance al aprobar.",
            "Versión aprobada vigente — Referenciada en ficha e informe; snapshot en auditoría.",
          ],
        },
      ],
      bullets: [
        "Crear y versionar planes de cuentas.",
        "Importar rubros desde CSV.",
        "Explorar en vista árbol, tabla ERP o secciones (activo / pasivo / patrimonio / resultados).",
        "Buscar y filtrar por código, nombre, alias o corriente/no corriente.",
        "Aprobar formalmente una versión para uso operativo.",
      ],
    },
  },
  usuarios: {
    title: "Usuarios y permisos internos",
    subtitle: "Creá cuentas y asigná roles (analista, administrador, etc.).",
    help: {
      title: "¿Para qué sirve la gestión de usuarios?",
      summary:
        "Administrá quién puede entrar a SOOFT FINYX y qué puede hacer cada persona según su rol interno.",
      whenToUse: "Al incorporar un nuevo analista o administrador, o al cambiar permisos de acceso.",
      bullets: [
        "Crear usuarios con email y contraseña.",
        "Asignar roles: analista, administrador u otros definidos.",
        "Controlar acceso a módulos sensibles de administración.",
        "Mantener trazabilidad de quién opera el sistema.",
      ],
    },
  },
  "ia-uso": {
    title: "Uso y costos de IA",
    subtitle: "Auditoría de llamadas a OpenAI y Anthropic: actor, función, tokens y coste estimado.",
    help: {
      title: "¿Para qué sirve esta pantalla?",
      summary:
        "Registra cada invocación a modelos de IA del sistema: quién la disparó (usuario o pipeline automático), qué función la originó, proveedor y modelo, tokens de entrada/salida y un coste USD estimado.",
      whenToUse:
        "Para controlar el gasto en IA, diagnosticar extracciones costosas o auditar quién generó informes con narrativa automática.",
      bullets: [
        "Extracción visión — lectura página a página de PDFs e imágenes.",
        "Extracción metadatos — re-lectura del encabezado del documento.",
        "Informe narrativa — redacción automática del informe de comité.",
        "Los costes son estimativos según tarifas públicas; no reemplazan la factura del proveedor.",
      ],
    },
  },
  "operacion-sys": {
    title: "Mantenimiento y procesamiento",
    subtitle: "Seguimiento de las etapas automáticas de cada ficha, reintentos y alertas.",
    help: {
      title: "¿Para qué sirve esta pantalla?",
      summary:
        "Permite ver si las fichas se están procesando bien, entender cada etapa (preparación, lectura, normalización, clasificación y validación) con el botón ℹ, reintentar fichas atascadas y configurar qué pasa con PDFs ilegibles.",
      whenToUse:
        "Cuando una ficha no avanza, hay errores en la bandeja o necesitás revisar quién recibe alertas por correo.",
      bullets: [
        "Grilla de 5 etapas con ℹ en cada fila — explicación en lenguaje funcional.",
        "La cola de ingesta por correo no aparece a propósito: solo recibe mails, no procesa la ficha.",
        "Reintentar procesamiento con número de ficha o ID de expediente.",
        "Política ante PDFs ilegibles y destinatarios de notificaciones.",
        "Configuración OCR y pruebas técnicas en secciones plegables al final.",
      ],
    },
  },
  flujo: {
    title: "Mapa del proceso SOOFT FINYX",
    subtitle: "Visualización del recorrido de seis etapas que sigue cada ficha financiera.",
    help: {
      title: "¿Para qué sirve el mapa del proceso?",
      summary:
        "Esta pantalla muestra el flujo institucional completo de SOOFT FINYX como un diagrama secuencial (nodo → flecha → nodo). Permite comprender el recorrido estándar antes de operar un caso y localizar expedientes específicos.",
      whenToUse:
        "Al incorporarse al sistema, al capacitar analistas o cuando se requiera orientación sobre en qué etapa se encuentra un expediente.",
      sections: [
        {
          title: "Las 6 etapas del flujo",
          bullets: [
            "1. Carga documental — ingreso del PDF o imagen.",
            "2. Procesamiento automático — extracción, normalización, clasificación y validación.",
            "3. Revisión del analista — corrección y validación humana.",
            "4. Aprobación de ficha — cierre formal con indicadores.",
            "5. Archivo en repositorio — disponibilidad histórica.",
            "6. Informe de comité — documento para presentación.",
          ],
        },
      ],
      bullets: [
        "Diagrama general con descripción de cada nodo.",
        "Listado de expedientes con filtros por empresa, RUT, etapa y estado.",
        "Enlaces directos a los módulos operativos de cada etapa.",
      ],
    },
  },
  expediente: {
    title: "Expediente del caso",
    subtitle: "Seguimiento nodo a nodo del avance de una ficha en particular.",
    help: {
      title: "¿Para qué sirve la vista de expediente?",
      summary:
        "Muestra el estado actual de un caso concreto sobre el mismo diagrama de seis etapas, resaltando cuál está completada, cuál está en curso y cuáles están pendientes. Incluye el detalle del procesamiento automático y un historial plegable de movimientos.",
      whenToUse:
        "Cuando necesite saber exactamente dónde está un caso, diagnosticar demoras o comunicar el avance a un referente interno.",
      bullets: [
        "Diagrama con estado por etapa (completada, en curso, pendiente o interrumpida).",
        "Detalle del procesamiento automático con pasos en lenguaje claro (listo, en curso, pendiente).",
        "Historial de movimientos plegable — abierto solo cuando lo necesite.",
        "Accesos directos a revisión, informe y bandeja de fichas.",
      ],
    },
  },
};

export function getPageInfo(key: string): PageMeta | undefined {
  return PAGE_INFO[key];
}
