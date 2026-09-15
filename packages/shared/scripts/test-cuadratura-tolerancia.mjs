import assert from "node:assert/strict";
import { evaluarCuadraturaBalance } from "../dist/cuadratura.js";

// CMP-like: 0,102 % de desbalance — antes fallaba al 0,1 % estricto
const activo = 4_507_740_000_000;
const pasivo = 1_816_060_000_000;
const patrimonio = 2_687_100_000_000;
const ev = evaluarCuadraturaBalance(activo, pasivo, patrimonio);

assert.equal(ev.cuadraturaOk, true, "0,102% debe cuadrar con tolerancia 0,15%");
assert.equal(ev.cuadraturaCritica, false);

// Desbalance material
const ev2 = evaluarCuadraturaBalance(1000, 400, 400);
assert.equal(ev2.cuadraturaOk, false);
assert.equal(ev2.cuadraturaCritica, true);

console.log("test-cuadratura-tolerancia: OK");
