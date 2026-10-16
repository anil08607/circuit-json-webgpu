import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const installed = dirname(require.resolve("circuit-to-canvas/package.json"))
const target = fileURLToPath(
  new URL("../upstream/circuit-to-canvas/", import.meta.url),
)
const manifest = JSON.parse(
  readFileSync(new URL("./upstream-manifest.json", import.meta.url), "utf8"),
)
// Use a disposable copy: upstream matchers write diffs beside their goldens.
// Copy every manifest entry so the installed dependency stays untouched.
for (const path of Object.keys(manifest.files)) {
  const dest = resolve(target, path)
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(resolve(installed, path), dest)
}

// Keep the frozen Canvas suite on the schema and SVG reference its goldens were
// authored against. The parity runner still imports the current root SVG version.
for (const dependency of ["circuit-json", "circuit-to-svg"]) {
  const reference = dirname(
    require.resolve(`${dependency}-reference/package.json`),
  )
  const link = resolve(target, "node_modules", dependency)
  mkdirSync(dirname(link), { recursive: true })
  rmSync(link, { recursive: true, force: true })
  symlinkSync(reference, link, "dir")
}
