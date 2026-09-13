import json
from pathlib import Path

d = json.loads(Path(r"c:\Users\lenovo\FFA\insumos\_digest.json").read_text(encoding="utf-8"))

rows = d["xlsx"]["sheets"]["Hoja1"]["rows"]
print("=== XLSX: Distribucion HS/ROL ===")
for i, row in enumerate(rows):
    non_empty = [c for c in row if c.strip()]
    if non_empty:
        print(f"Row {i+1}:", " | ".join(non_empty))

print("\n=== DOCX: Ficha Financiera Automatizada ===")
for name, data in d.items():
    if name == "xlsx":
        continue
    if "2026-09-09" in name:
        for p in data["paragraphs"][:50]:
            print(p)
        print(f"\n... ({data['para_count']} parrafos, {data['table_count']} tablas)")
        for ti, tbl in enumerate(data["tables"][:3]):
            print(f"\n--- Tabla {ti+1} ({len(tbl)} filas) ---")
            for row in tbl[:6]:
                print("  ", row)

print("\n=== DOCX: Reunion validacion Factoring ===")
for name, data in d.items():
    if name == "xlsx" or "2026-09-09" in name:
        continue
    for p in data["paragraphs"]:
        print(p)
