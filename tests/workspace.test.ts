import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(new URL(path, root), "utf8")) as Record<string, unknown>;
}

describe("workspace bootstrap", () => {
  it("declares the required application and package workspaces", async () => {
    const workspace = await readFile(new URL("pnpm-workspace.yaml", root), "utf8");
    expect(workspace).toContain('"apps/*"');
    expect(workspace).toContain('"packages/*"');

    const names = ["game", "server", "shared", "core", "maps", "simulator", "metrics"];
    const manifests = await Promise.all(
      names.map(async (name) => {
        const category = ["game", "server"].includes(name) ? "apps" : "packages";
        return readJson(`${category}/${name}/package.json`);
      }),
    );

    expect(manifests.map((manifest) => manifest.name)).toEqual(
      names.map((name) => `@fantasy-frontiers/${name}`),
    );
  });

  it("keeps Game Core free of rendering, persistence, and model dependencies", async () => {
    const manifest = await readJson("packages/core/package.json");
    const source = await readFile(new URL("packages/core/src/index.ts", root), "utf8");
    const dependencies = Object.keys((manifest.dependencies ?? {}) as Record<string, unknown>);

    expect(dependencies).not.toContain("phaser");
    expect(source).not.toMatch(/from ["'](?:phaser|sqlite3?|better-sqlite3|openai|@anthropic-ai)["']/i);
    expect(source).not.toMatch(/\b(?:window|document)\b/);
  });
});
