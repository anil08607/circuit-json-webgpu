import type { ReferenceTest } from "./types"
import { spawnSync } from "node:child_process"
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readdirSync,
} from "node:fs"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import { resolve, relative } from "node:path"
import "./prepare-upstream.ts"
const root = fileURLToPath(new URL("../../", import.meta.url))
const upstream = resolve(root, "tests/upstream/circuit-to-canvas")
const manifest = JSON.parse(
  readFileSync(resolve(root, "tests/parity/upstream-manifest.json"), "utf8"),
)
for (const [path, hash] of Object.entries(manifest.files)) {
  if (
    createHash("sha256")
      .update(readFileSync(resolve(upstream, path)))
      .digest("hex") !== hash
  )
    throw Error(`Upstream file changed: ${path}`)
}
const actual = resolve(root, "tests/actual/parity")
mkdirSync(actual, { recursive: true })
// Always finish the GPU audit even when upstream's own frozen snapshots drift.
const reference = spawnSync(
  "bun",
  [
    "test",
    "--preload",
    "./tests/parity/capture.ts",
    "./tests/upstream/circuit-to-canvas/tests",
  ],
  { cwd: root, encoding: "utf8" },
)
writeFileSync(
  resolve(actual, "reference.log"),
  (reference.stdout ?? "") + (reference.stderr ?? ""),
)
console.log(
  `Reference test process exited ${reference.status}; see tests/actual/parity/reference.log`,
)
const tests: ReferenceTest[] = JSON.parse(
  readFileSync(resolve(actual, "tests.json"), "utf8"),
)
if (tests.length !== 164 || new Set(tests.map((t) => t.path)).size !== 116)
  throw Error("Incomplete upstream test execution")
const result = spawnSync("bun", ["tests/parity/run.ts"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
})
// The unchanged upstream matcher writes diff/missing files next to its goldens.
// Move those into the audit artifacts and keep the generated test workspace pristine.
function moveGeneratedFiles(directory: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = resolve(directory, entry.name)
    // Never traverse reference dependencies, including Bun's directory symlinks.
    if (entry.name === "node_modules" || entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      moveGeneratedFiles(full)
      continue
    }
    if (!entry.isFile()) continue
    const path = relative(upstream, full)
    if (path === "manifest.json" || manifest.files[path]) continue
    const dest = resolve(actual, "upstream-generated", path)
    mkdirSync(resolve(dest, ".."), { recursive: true })
    writeFileSync(dest, readFileSync(full))
    rmSync(full)
  }
}
moveGeneratedFiles(upstream)
process.exitCode =
  result.status || (process.env.SNAPSHOT_TEST_ONLY ? 0 : reference.status) || 0
