"""
Actualiza el cuadro de avance en ESPECIFICACION-FUNCIONAL-FFA.md
desde docs/avance-funcional.json.

Uso:
  python docs/scripts/actualizar-cuadro-avance.py
  python docs/scripts/actualizar-cuadro-avance.py --marcar J.12 ESTA --evidencia "PR #45"

Estados válidos: NO ESTA | EN PROGRESO | ESTA | N/A
"""

import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AVANCE_PATH = ROOT / "docs" / "avance-funcional.json"
SPEC_PATH = ROOT / "docs" / "ESPECIFICACION-FUNCIONAL-FFA.md"

GRUPO_NOMBRES = {
    "A": "Recepción e ingesta",
    "B": "Preprocesamiento",
    "C": "Extracción",
    "D": "Normalización",
    "E": "Plan de cuentas",
    "F": "Clasificación",
    "G": "Memoria criterios",
    "H": "Validación contable",
    "I": "Umbral / excepción",
    "J": "Estación revisión",
    "K": "Ficha canónica",
    "L": "Indicadores",
    "M": "Informe comité",
    "N": "Repositorio",
    "O": "Orquestación async",
    "P": "Auditoría",
    "Q": "Portal / UX",
    "R": "Administración",
    "S": "Seguridad",
    "T": "Notificaciones",
    "U": "KPIs",
    "V": "Integración ECR (servicio)",
    "W": "Entidades negocio",
    "X": "Reglas transversales",
    "Y": "Dependencias cliente",
    "Z": "Soporte Go-Live",
    "AA": "Pipeline 8 etapas E2E",
    "AB": "Contribuyentes",
    "AC": "Ciclo vida caso",
    "AD": "Principios FFA",
    "AE": "Aprobaciones config",
    "AF": "Capacitación UAT",
}


def recalcular(avance: dict) -> None:
    software_exclude = {"Y", "V", "Z", "AF"}
    esta = en_progreso = na = 0
    grupos: dict[str, dict] = {}

    for item_id, meta in avance["items"].items():
        g = item_id.split(".")[0]
        grupos.setdefault(
            g,
            {"total": 0, "software": 0, "esta": 0, "no_esta": 0, "en_progreso": 0, "na": 0},
        )
        grupos[g]["total"] += 1
        est = meta.get("estado", "NO ESTA").upper()

        if g not in software_exclude:
            grupos[g]["software"] += 1
            if est == "ESTA":
                esta += 1
                grupos[g]["esta"] += 1
            elif est == "EN PROGRESO":
                en_progreso += 1
                grupos[g]["en_progreso"] += 1
            elif est == "N/A":
                na += 1
                grupos[g]["na"] += 1
            else:
                grupos[g]["no_esta"] += 1
        else:
            if est == "ESTA":
                grupos[g]["esta"] += 1
            elif est == "EN PROGRESO":
                grupos[g]["en_progreso"] += 1
            elif est == "N/A":
                grupos[g]["na"] += 1
            else:
                grupos[g]["no_esta"] += 1

    for g, data in grupos.items():
        if g in software_exclude:
            denom = data["total"]
            data["porcentaje"] = round((data["esta"] + data["na"]) / denom * 100, 1) if denom else 0.0
        else:
            denom = data["software"]
            data["porcentaje"] = round((data["esta"] + data["na"]) / denom * 100, 1) if denom else 0.0

    avance["grupos"] = grupos
    sw_total = sum(d["software"] for d in grupos.values())
    total_items = len(avance["items"])
    no_esta = sw_total - esta - en_progreso - na
    pct = round((esta + na) / sw_total * 100, 1) if sw_total else 0.0
    avance["resumen"] = {
        "total_items": total_items,
        "software_items": sw_total,
        "esta": esta,
        "no_esta": no_esta,
        "en_progreso": en_progreso,
        "na": na,
        "porcentaje": pct,
    }
    avance["ultima_actualizacion"] = str(date.today())


def generar_cuadro(avance: dict) -> str:
    r = avance["resumen"]
    lines = [
        "## 0. Cuadro de avance del proyecto",
        "",
        "> **Documento maestro QUÉ:** este catálogo es la fuente de verdad. Cada ítem se marca **ESTA** o **NO ESTA** en `docs/avance-funcional.json` y se refresca este cuadro con `python docs/scripts/actualizar-cuadro-avance.py`.",
        "",
        f"**Última actualización:** {avance['ultima_actualizacion']}",
        "",
        "### Resumen global (software)",
        "",
        "| Métrica | Valor |",
        "|---------|-------|",
        f"| Ítems de software | {r['software_items']} |",
        f"| **ESTA** | {r['esta']} |",
        f"| **NO ESTA** | {r['no_esta']} |",
        f"| EN PROGRESO | {r['en_progreso']} |",
        f"| N/A | {r['na']} |",
        f"| **Avance** | **{r['porcentaje']}%** |",
        "",
        "### Avance por grupo",
        "",
        "| Grupo | Tema | Total | ESTA | NO ESTA | En progreso | N/A | % |",
        "|-------|------|-------|------|---------|-------------|-----|---|",
    ]

    software_exclude = {"Y", "V", "Z", "AF"}
    order = sorted(
        avance["grupos"].keys(),
        key=lambda x: (len(x), x),
    )
    for g in order:
        data = avance["grupos"][g]
        nombre = GRUPO_NOMBRES.get(g, g)
        tipo = "servicio/cliente" if g in software_exclude else "software"
        total_show = data["software"] if g not in software_exclude else data["total"]
        pct = f"{data['porcentaje']}%" if g not in software_exclude else "—"
        lines.append(
            f"| {g} | {nombre} ({tipo}) | {total_show} | {data['esta']} | {data['no_esta']} | {data['en_progreso']} | {data['na']} | {pct} |"
        )

    lines.extend(
        [
            "",
            "### Entregables servicio / cliente (seguimiento aparte)",
            "",
            "| Grupo | Tema | Total | ESTA | NO ESTA |",
            "|-------|------|-------|------|---------|",
        ]
    )
    for g in order:
        if g not in software_exclude:
            continue
        data = avance["grupos"][g]
        nombre = GRUPO_NOMBRES.get(g, g)
        lines.append(
            f"| {g} | {nombre} | {data['total']} | {data['esta']} | {data['no_esta']} |"
        )

    lines.extend(
        [
            "",
            "### Barra de avance (solo software)",
            "",
            f"`{'█' * int(r['porcentaje'] // 5)}{'░' * (20 - int(r['porcentaje'] // 5))}` {r['porcentaje']}%",
            "",
            "<!-- FIN_CUADRO_AVANCE -->",
            "",
        ]
    )
    return "\n".join(lines)


def patch_spec(cuadro: str) -> None:
    text = SPEC_PATH.read_text(encoding="utf-8")
    if "<!-- FIN_CUADRO_AVANCE -->" in text:
        text = re.sub(
            r"## 0\. Cuadro de avance del proyecto.*?<!-- FIN_CUADRO_AVANCE -->\n",
            cuadro,
            text,
            flags=re.DOTALL,
        )
    else:
        text = text.replace(
            "---\n\n## 1. Propósito",
            "---\n\n" + cuadro + "## 1. Propósito",
            1,
        )
    SPEC_PATH.write_text(text, encoding="utf-8")


def main() -> None:
    avance = json.loads(AVANCE_PATH.read_text(encoding="utf-8"))

    if len(sys.argv) >= 4 and sys.argv[1] == "--marcar":
        item_id, estado = sys.argv[2], sys.argv[3].upper()
        evidencia = ""
        if "--evidencia" in sys.argv:
            evidencia = sys.argv[sys.argv.index("--evidencia") + 1]
        if item_id not in avance["items"]:
            raise SystemExit(f"Ítem desconocido: {item_id}")
        avance["items"][item_id]["estado"] = estado
        avance["items"][item_id]["fecha"] = str(date.today())
        if evidencia:
            avance["items"][item_id]["evidencia"] = evidencia

    recalcular(avance)
    AVANCE_PATH.write_text(json.dumps(avance, ensure_ascii=False, indent=2), encoding="utf-8")
    patch_spec(generar_cuadro(avance))
    r = avance["resumen"]
    print(f"Cuadro actualizado: {r['porcentaje']}% software ({r['esta']}/{r['software_items']} ESTA)")


if __name__ == "__main__":
    main()
