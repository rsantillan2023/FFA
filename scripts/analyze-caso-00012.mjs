import { MongoClient, ObjectId } from "mongodb";

const client = new MongoClient("mongodb://127.0.0.1:27017/ffa");
await client.connect();
const db = client.db();
const casoId = new ObjectId("6aa5a89170329b7209b5fd5c");

const doc = await db.collection("documentofuentes").findOne({ casoId });
console.log("nombre archivo:", doc?.nombreOriginal || doc?.nombre);
console.log("paginaCount:", doc?.paginaCount);
console.log("tipoDocumento:", doc?.tipoDocumento);
const inf = doc?.extractPayload?.informeExtraccion;
console.log("informe:", JSON.stringify({
  confianzaGlobal: inf?.confianzaGlobal,
  coberturaGlobal: inf?.coberturaDesglose?.coberturaGlobal,
  coberturaLineas: inf?.coberturaDesglose?.coberturaLineas,
  controlesFallidos: inf?.controlesFallidos,
  controlesAprobados: inf?.controlesAprobados,
  inconsistencias: inf?.inconsistencias?.length,
  duplicadosResueltos: inf?.duplicadosResueltos,
  paginasProcesadas: inf?.paginasProcesadas,
}, null, 2));

const lineas = await db.collection("lineacontables").find({ casoId }).toArray();
const sinRubro = lineas.filter((l) => !l.rubroInstitucionalId);
console.log("\nEjemplos SIN RUBRO (8):");
for (const l of sinRubro.slice(0, 8)) {
  console.log(`  p${l.paginaNumero} | conf=${l.confianzaClasificacion} | ${l.denominacionOriginal?.slice(0, 75)}`);
}

const conRubro = lineas.filter((l) => l.rubroInstitucionalId);
console.log("\nEjemplos CON RUBRO (5):");
for (const l of conRubro.slice(0, 5)) {
  console.log(`  ${l.rubroCodigo} | conf=${l.confianzaClasificacion} | ${l.denominacionOriginal?.slice(0, 60)}`);
}

const paginas = {};
for (const l of doc?.extractPayload?.lineas ?? []) {
  paginas[l.paginaNumero] = (paginas[l.paginaNumero] ?? 0) + 1;
}
console.log("\nLineas por pagina (extract):", paginas);

const heuristica = (doc?.extractPayload?.lineas ?? []).filter((l) => l.metodoExtraccion === "heuristica").length;
console.log("Lineas heuristica (tabla texto):", heuristica);

await client.close();
