import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildApp } from "./index.js";

describe("FFA API smoke", () => {
  it("GET / responde información de la API", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/" });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { name: string };
    assert.equal(body.name, "SOOFT FINYX API");
    await app.close();
  });

  it("GET /health responde status", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { status: string };
    assert.ok(["ok", "degraded"].includes(body.status));
    await app.close();
  });
});
