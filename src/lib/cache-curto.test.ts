import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { cacheCurto, limparCacheCurto } from "./cache-curto";

describe("cacheCurto", () => {
  beforeEach(() => limparCacheCurto());

  it("reaproveita o resultado dentro do prazo e junta chamadas simultâneas", async () => {
    const buscar = vi.fn(async () => 42);
    const [a, b] = await Promise.all([cacheCurto("k", 30, buscar), cacheCurto("k", 30, buscar)]);
    expect([a, b]).toEqual([42, 42]);
    await cacheCurto("k", 30, buscar);
    expect(buscar).toHaveBeenCalledTimes(1);
  });
  it("chaves diferentes não se misturam (usuários distintos)", async () => {
    expect(await cacheCurto("u1", 30, async () => "a")).toBe("a");
    expect(await cacheCurto("u2", 30, async () => "b")).toBe("b");
  });
  it("limpar força nova busca (após gravações)", async () => {
    const buscar = vi.fn(async () => 1);
    await cacheCurto("k", 30, buscar);
    limparCacheCurto();
    await cacheCurto("k", 30, buscar);
    expect(buscar).toHaveBeenCalledTimes(2);
  });
  it("não guarda falhas", async () => {
    await expect(cacheCurto("k", 30, async () => { throw new Error("x"); })).rejects.toThrow("x");
    expect(await cacheCurto("k", 30, async () => "ok")).toBe("ok");
  });
  it("expira após o prazo", async () => {
    vi.useFakeTimers();
    const buscar = vi.fn(async () => 1);
    await cacheCurto("k", 1, buscar);
    vi.advanceTimersByTime(1500);
    await cacheCurto("k", 1, buscar);
    expect(buscar).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
