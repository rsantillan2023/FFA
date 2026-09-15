import assert from "node:assert/strict";
import {
  sugerirRubroAgrupadorSubtotal,
  clasificarLineaSubtotalBalance,
} from "../dist/balance/subtotal-rubro.js";

const rubros = [
  { id: "1", codigo: "1", nombre: "Activo", estadoFinanciero: "activo" },
  { id: "1.1", codigo: "1.1", nombre: "Activo no corriente", estadoFinanciero: "activo" },
  { id: "1.2", codigo: "1.2", nombre: "Activo corriente", estadoFinanciero: "activo" },
  { id: "2", codigo: "2", nombre: "Pasivo", estadoFinanciero: "pasivo" },
  { id: "3", codigo: "3", nombre: "Patrimonio", estadoFinanciero: "patrimonio" },
  { id: "3.3", codigo: "3.3", nombre: "Patrimonio atribuible", estadoFinanciero: "patrimonio" },
];

assert.equal(sugerirRubroAgrupadorSubtotal("TOTAL ACTIVOS"), "1");
assert.equal(sugerirRubroAgrupadorSubtotal("Total activos corrientes"), "1.2");
assert.equal(sugerirRubroAgrupadorSubtotal("PATRIMONIO TOTAL"), "3");
assert.equal(sugerirRubroAgrupadorSubtotal("Patrimonio atribuible a accionistas"), "3.3");

const sub = clasificarLineaSubtotalBalance(
  {
    denominacionOriginal: "TOTAL ACTIVOS",
    montoOriginal: 26_800_000_000_000,
    paginaNumero: 1,
  },
  rubros
);
assert.equal(sub.rubroCodigo, "1");
assert.equal(sub.confianzaClasificacion, 92);
assert.equal(sub.excluirDeCuadratura, true);
assert.equal(sub.requiereRevision, false);

console.log("test-subtotal-rubro: OK");
