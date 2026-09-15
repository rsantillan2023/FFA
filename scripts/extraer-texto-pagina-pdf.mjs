import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pdfPath = process.argv[2] || "C:/Users/lenovo/Downloads/MEMORIA-2024-EEFF.pdf";
const pageNum = parseInt(process.argv[3] || "76", 10);

const buf = readFileSync(pdfPath);
const { loadPdfDocument } = await import("../packages/pipeline/dist/extract/pdf-loader.js");
const pdf = await loadPdfDocument(buf);
const page = await pdf.getPage(pageNum);
const content = await page.getTextContent();

const items = content.items.map((item) => ({
  str: "str" in item ? item.str : "",
  x: item.transform?.[4] ?? 0,
  y: item.transform?.[5] ?? 0,
}));

items.sort((a, b) => b.y - a.y || a.x - b.x);

// Agrupar por fila (misma Y aprox)
const rows = [];
for (const it of items) {
  const row = rows.find((r) => Math.abs(r.y - it.y) < 3);
  if (row) {
    row.parts.push(it);
  } else {
    rows.push({ y: it.y, parts: [it] });
  }
}

for (const row of rows) {
  row.parts.sort((a, b) => a.x - b.x);
  const text = row.parts.map((p) => p.str).join(" ").replace(/\s+/g, " ").trim();
  if (text) console.log(text);
}
