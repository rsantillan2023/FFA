import {

  CasoModel,

  ContribuyenteModel,

  FichaCanonicaModel,

  IndicadorCalculadoModel,

  InformeComiteModel,

} from "@ffa/db";

import {

  Document,

  HeadingLevel,

  Packer,

  Paragraph,

  Table,

  TableCell,

  TableRow,

  TextRun,

  WidthType,

} from "docx";

import {

  filasDetalleTrazabilidad,

  filasInconsistencias,

  fmtIndicadorValor,

  fmtMonto,

  indicadorNombre,

  resolveIdentidadInforme,

} from "./informe-helpers.js";



function cell(text: string, bold = false): TableCell {

  return new TableCell({

    children: [new Paragraph({ children: [new TextRun({ text, bold })] })],

  });

}



function dataTable(headers: string[], rows: string[][]): Table {

  return new Table({

    width: { size: 100, type: WidthType.PERCENTAGE },

    rows: [

      new TableRow({ children: headers.map((h) => cell(h, true)) }),

      ...rows.map((row) => new TableRow({ children: row.map((c) => cell(c)) })),

    ],

  });

}



export async function buildInformeDocx(informeId: string): Promise<Buffer> {

  const informe = await InformeComiteModel.findById(informeId);

  if (!informe) throw new Error("Informe no encontrado");



  const [ficha, caso, indicadores] = await Promise.all([

    FichaCanonicaModel.findById(informe.fichaId),

    CasoModel.findById(informe.casoId),

    IndicadorCalculadoModel.find({ fichaId: informe.fichaId }),

  ]);

  if (!ficha || !caso) throw new Error("Datos del informe incompletos");



  const contrib = ficha.contribuyenteId

    ? await ContribuyenteModel.findById(ficha.contribuyenteId)

    : null;



  const identidad = await resolveIdentidadInforme(

    ficha.casoId.toString(),

    contrib,

    caso.periodo?.ejercicio

  );



  const moneda = caso.moneda ?? "CLP";

  const escala = caso.escala ?? "miles";



  const manuales = informe.apartadosManuales as Map<string, string> | Record<string, string>;

  const getManual = (id: string): string => {

    if (manuales instanceof Map) return manuales.get(id) ?? "";

    return (manuales as Record<string, string>)[id] ?? "";

  };



  const ac = ficha.balance?.activoCorriente ?? 0;

  const anc = ficha.balance?.activoNoCorriente ?? 0;

  const pc = ficha.balance?.pasivoCorriente ?? 0;

  const pnc = ficha.balance?.pasivoNoCorriente ?? 0;

  const pat = ficha.balance?.patrimonio ?? 0;



  const balanceRows: string[][] = [

    ["Activo corriente", fmtMonto(ac, moneda, escala)],

    ["Activo no corriente", fmtMonto(anc, moneda, escala)],

    ["Total activo", fmtMonto(ac + anc, moneda, escala)],

    ["Pasivo corriente", fmtMonto(pc, moneda, escala)],

    ["Pasivo no corriente", fmtMonto(pnc, moneda, escala)],

    ["Total pasivo", fmtMonto(pc + pnc, moneda, escala)],

    ["Patrimonio", fmtMonto(pat, moneda, escala)],

    ["Utilidad ejercicio", fmtMonto(ficha.estadoResultados?.utilidad, moneda, escala)],

  ];



  const indRows: string[][] = indicadores.map((i) => [

    indicadorNombre(i.indicadorCodigo),

    i.calculable
      ? fmtIndicadorValor(i.indicadorCodigo, i.valor, { moneda, escala })
      : `N/C (${i.error ?? "—"})`,

  ]);



  const [trazRows, incRows] = await Promise.all([

    filasDetalleTrazabilidad(ficha, { moneda, escala }),

    filasInconsistencias(ficha.casoId.toString()),

  ]);



  const liq = indicadores.find((i) => i.indicadorCodigo === "LIQ_CORRIENTE");

  const end = indicadores.find((i) => i.indicadorCodigo === "END_TOTAL");



  const resumen =

    `${identidad.razonSocial} — ejercicio ${identidad.ejercicio ?? caso.periodo?.ejercicio ?? "—"}. ` +

    `Confianza pipeline: ${caso.confianzaGlobal ?? "—"}%. ` +

    `Liquidez: ${liq?.calculable ? fmtIndicadorValor("LIQ_CORRIENTE", liq.valor) : "N/C"}. ` +

    `Endeudamiento: ${end?.calculable ? fmtIndicadorValor("END_TOTAL", end.valor) : "N/C"}.`;



  const analisis = getManual("apartado_analisis") || "(Sin completar)";

  const recomendacion = getManual("apartado_recomendacion") || "(Sin completar)";



  const doc = new Document({

    sections: [

      {

        children: [

          new Paragraph({

            text: "Informe Comité Factoring — ECR Salud",

            heading: HeadingLevel.HEADING_1,

          }),

          new Paragraph({

            children: [

              new TextRun({

                text: `Caso ${caso.numero} · ${identidad.razonSocial} · RUT ${identidad.rut} · Ejercicio ${identidad.ejercicio ?? caso.periodo?.ejercicio ?? "—"}`,

                italics: true,

              }),

            ],

          }),

          new Paragraph({

            children: [

              new TextRun({

                text: `Semáforo: ${caso.semaforo ?? "—"} · Confianza: ${caso.confianzaGlobal ?? "—"}% · ${moneda} (${escala}) · Estado informe: ${informe.estado}`,

                size: 20,

                color: "64748B",

              }),

            ],

          }),

          new Paragraph({ text: "Resumen ejecutivo", heading: HeadingLevel.HEADING_2 }),

          new Paragraph(resumen),

          new Paragraph({ text: "Balance resumido", heading: HeadingLevel.HEADING_2 }),

          dataTable(["Concepto", "Monto"], balanceRows),

          new Paragraph({ text: "Indicadores financieros", heading: HeadingLevel.HEADING_2 }),

          dataTable(["Indicador", "Valor"], indRows.length ? indRows : [["—", "Sin datos"]]),

          new Paragraph({

            text: "Detalle con trazabilidad",

            heading: HeadingLevel.HEADING_2,

          }),

          dataTable(

            ["Concepto", "Valor", "Origen"],

            trazRows.length ? trazRows : [["—", "—", "Sin datos"]]

          ),

          new Paragraph({ text: "Validaciones e inconsistencias", heading: HeadingLevel.HEADING_2 }),

          dataTable(

            ["Tipo", "Mensaje", "Estado"],

            incRows.length ? incRows : [["—", "Sin inconsistencias", "—"]]

          ),

          new Paragraph({ text: "Análisis del analista", heading: HeadingLevel.HEADING_2 }),

          ...analisis.split(/\n{2,}/).map((p) => new Paragraph(p)),

          new Paragraph({ text: "Recomendación comité", heading: HeadingLevel.HEADING_2 }),

          ...recomendacion.split(/\n{2,}/).map((p) => new Paragraph(p)),

          new Paragraph({

            children: [

              new TextRun({

                text: `Generado ${new Date().toLocaleString("es-CL")} · Ficha v${ficha.version} · SOOFT FINYX`,

                size: 18,

                color: "64748B",

              }),

            ],

          }),

        ],

      },

    ],

  });



  return Buffer.from(await Packer.toBuffer(doc));

}

