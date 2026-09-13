import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

d = json.loads(Path(r"c:\Users\lenovo\FFA\insumos\_digest.json").read_text(encoding="utf-8"))

# Reunion notes
for name, data in d.items():
    if "Reunion" in name:
        print("=== REUNION VALIDACION FACTORING ===\n")
        for p in data["paragraphs"]:
            print(p)
            print()

# Key sections from FFA doc
for name, data in d.items():
    if "2026-09-09" not in name:
        continue
    paras = data["paragraphs"]
    keywords = [
        "Etapa",
        "Entregable",
        "Arquitectura",
        "Costo",
        "Semana",
        "stack",
        "tecnolog",
        "Go-Live",
        "umbral",
        "85%",
        "plan de cuentas",
    ]
    print("\n=== SECCIONES CLAVE FFA ===\n")
    for i, p in enumerate(paras):
        if any(k.lower() in p.lower() for k in keywords) or p.startswith(("Etapa", "Fase", "Sprint")):
            print(f"[{i}] {p}")
    print("\n=== TABLAS CON CONTENIDO (>1 fila) ===\n")
    for ti, tbl in enumerate(data["tables"]):
        if len(tbl) > 2:
            print(f"--- Tabla {ti+1} ---")
            for row in tbl:
                if any(c.strip() for c in row):
                    print(" | ".join(row))
