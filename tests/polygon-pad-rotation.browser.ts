import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import pixelmatch from "pixelmatch"
import { PNG } from "pngjs"
import type { Browser, Page } from "playwright"
import { compose, rotateDEG, scale, translate } from "transformation-matrix"
import { createServer, type ViteDevServer } from "vite"
import { launchWebGpuBrowser } from "../scripts/lib/launch-webgpu-browser"
import { jaeShellPad } from "./fixtures/jae-shell-pad"

let server: ViteDevServer
let browser: Browser
let page: Page
const snapshot = new URL("./snapshots/jae-shell-pad-90.png", import.meta.url)

beforeAll(async () => {
  server = await createServer({
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0, hmr: false },
    logLevel: "error",
  })
  await server.listen()
  browser = await launchWebGpuBrowser()
  page = await browser.newPage()
  await page.goto(server.resolvedUrls!.local[0])
  await page.waitForFunction(() => window.gpuTest)
})

afterAll(async () => {
  await browser?.close()
  await server?.close()
})

async function render(rotation: number, cameraRotation = 0) {
  const transform = compose(
    translate(200, 200),
    scale(100, -100),
    rotateDEG(cameraRotation),
    translate(-jaeShellPad.x, -jaeShellPad.y),
  )
  const diagnostics = await page.evaluate(
    async ({ element, transform }) => {
      const canvas = document.querySelector("canvas")!
      canvas.width = canvas.height = 400
      canvas.style.width = canvas.style.height = "400px"
      canvas.style.border = "0"
      const drawer = window.gpuTest.drawer
      drawer.drawElements([element], {
        transform,
        layers: ["top"],
        background: [0, 0, 0, 1],
      })
      await drawer.flush()
      return drawer.diagnostics
    },
    { element: { ...jaeShellPad, ccw_rotation: rotation }, transform },
  )
  expect(diagnostics).toEqual([])
  return page.locator("canvas").screenshot()
}

async function expectSnapshot(
  actual: Buffer,
  name: string,
  reference?: Buffer,
) {
  const expected = PNG.sync.read(reference ?? (await readFile(snapshot)))
  const image = PNG.sync.read(actual)
  const { width, height } = image
  expect([width, height]).toEqual([expected.width, expected.height])
  const diff = new PNG({ width, height })
  const changed = pixelmatch(
    expected.data,
    image.data,
    diff.data,
    width,
    height,
    { threshold: 0.1 },
  )
  if (changed > width * height * 0.002) {
    const directory = new URL("./actual/", import.meta.url)
    await mkdir(directory, { recursive: true })
    await writeFile(new URL(`${name}.png`, directory), actual)
    await writeFile(
      new URL(`${name}.diff.png`, directory),
      PNG.sync.write(diff),
    )
  }
  expect(changed).toBeLessThanOrEqual(width * height * 0.002)
}

test("JAE shell-pad rendering matches its snapshot", async () => {
  const actual = await render(90)
  if (process.env.UPDATE_SNAPSHOTS) await writeFile(snapshot, actual)
  await expectSnapshot(actual, "jae-shell-pad-snapshot")
}, 60_000)

test("JAE shell pad rotates copper and slot together", async () => {
  const reference = await render(0, 90)
  await expectSnapshot(await render(90), "jae-shell-pad-rotation", reference)
}, 60_000)
