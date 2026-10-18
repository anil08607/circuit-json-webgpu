import { expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

test("packing a clean source checkout includes working runtime and type entrypoints", async () => {
  const root = resolve(import.meta.dir, "..")
  const temporary = mkdtempSync(join(tmpdir(), "webgpu-package-"))
  try {
    const source = join(temporary, "source")
    mkdirSync(source)
    for (const path of [
      "package.json",
      "tsconfig.json",
      "tsup.config.ts",
      "lib",
    ])
      cpSync(join(root, path), join(source, path), { recursive: true })
    symlinkSync(
      join(root, "node_modules"),
      join(temporary, "node_modules"),
      "dir",
    )
    expect(existsSync(join(source, "dist"))).toBe(false)

    execFileSync("npm", ["pack", "--silent"], {
      cwd: source,
      env: { ...process.env, npm_config_cache: join(temporary, "npm-cache") },
    })
    const archives = readdirSync(source).filter((path) => path.endsWith(".tgz"))
    expect(archives).toHaveLength(1)
    execFileSync("tar", ["-xzf", join(source, archives[0]), "-C", temporary])
    const packed = join(temporary, "package")
    const manifest = JSON.parse(
      readFileSync(join(packed, "package.json"), "utf8"),
    )
    for (const entry of [
      manifest.main,
      manifest.types,
      manifest.exports["."].import,
      manifest.exports["."].types,
    ])
      expect(existsSync(join(packed, entry)), entry).toBe(true)
    const { compileCircuitJson } = await import(
      pathToFileURL(join(packed, manifest.main)).href
    )
    expect(compileCircuitJson([]).diagnostics).toEqual([])
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}, 30_000)
