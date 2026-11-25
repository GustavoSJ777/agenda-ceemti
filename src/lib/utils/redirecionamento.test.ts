import { describe, expect, it } from "vitest";
import { caminhoInterno } from "./redirecionamento";

describe("caminhoInterno", () => {
  it("aceita caminhos internos", () => {
    expect(caminhoInterno("/nova-senha")).toBe("/nova-senha");
  });
  it.each(["//evil.com", "/\\evil.com", "https://evil.com", "evil.com", "/a\r\nb", "", null])("recusa %s", (v) => {
    expect(caminhoInterno(v as string | null)).toBe("/dashboard");
  });
});
