import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo, Server } from "node:net";
import { createApp } from "./app.js";

describe("HTTP application boundary", () => {
  let server: Server;
  let origin = "";

  beforeAll(async () => {
    server = createApp().listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as AddressInfo;
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("reports service health without requiring the database", async () => {
    const response = await fetch(`${origin}/health`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ok", service: "eventflow-api" });
  });

  it("returns the standard error envelope for protected routes", async () => {
    const response = await fetch(`${origin}/api/v1/auth/me`);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });
});
