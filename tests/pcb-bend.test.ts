import { expect, test } from "bun:test"
import type { PcbBend, PcbBoard } from "circuit-json"
import { compileCircuitJson, type Mesh } from "../lib"
import { pcbBends } from "../site/pcb-bend-fixture"

const board: PcbBoard = {
  type: "pcb_board",
  pcb_board_id: "board",
  center: { x: 20, y: 10 },
  width: 20,
  height: 20,
  thickness: 0.12,
  num_layers: 2,
  material: "fr4",
}
const bend: PcbBend = {
  type: "pcb_bend",
  pcb_bend_id: "bend",
  pcb_board_id: "board",
  start: { x: -4, y: 0 },
  end: { x: 4, y: 0 },
  bend_angle: 90,
  bend_radius: 2,
  bend_side: "right",
}

function covers(mesh: Mesh, x: number, y: number) {
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const points = [...mesh.indices.slice(i, i + 3)].map((index) => ({
      x: mesh.vertices[index * 8],
      y: mesh.vertices[index * 8 + 1],
    }))
    const sides = points.map((a, j) => {
      const b = points[(j + 1) % 3]
      return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x)
    })
    if (sides.every((v) => v >= 0) || sides.every((v) => v <= 0)) return true
  }
  return false
}

test("bend uses its owning board center once and preserves dash gaps and finite endpoints", () => {
  const scene = compileCircuitJson([
    { ...board, pcb_board_id: "unrelated", center: { x: -100, y: -100 } },
    { ...bend, pcb_group_id: "already-resolved-group" },
    board,
  ])
  expect(scene.diagnostics).toEqual([])
  const mesh = scene.layers.find((l) => l.name === "bend")!.paint
  expect(covers(mesh, 16.2, 10)).toBe(true)
  expect(covers(mesh, 16.95, 10)).toBe(false)
  expect(covers(mesh, 17.3, 10)).toBe(true)
  expect(covers(mesh, 15.99, 10)).toBe(false)
  expect(covers(mesh, 24.01, 10)).toBe(false)
  expect(covers(mesh, -3.8, 0)).toBe(false)
  for (let i = 0; i < mesh.vertices.length; i += 8) {
    expect(mesh.vertices[i + 6]).toBe(1)
    expect(mesh.vertices[i + 2]).toBe(1)
    expect(mesh.vertices[i + 3]).toBeCloseTo(213 / 255)
  }
})

test("bends leave the flat board geometry and input data unchanged", () => {
  const before = structuredClone(pcbBends)
  const flat = compileCircuitJson(pcbBends.filter((e) => e.type !== "pcb_bend"))
  const scene = compileCircuitJson(pcbBends)
  expect(scene.diagnostics).toEqual([])
  expect(scene.layers.filter((l) => l.name !== "bend")).toEqual(flat.layers)
  expect(pcbBends).toEqual(before)
  const mesh = scene.layers.find((l) => l.name === "bend")!.paint
  expect(covers(mesh, -19.8, 6)).toBe(true)
  expect(covers(mesh, 16, -7.8)).toBe(true)
  expect(covers(mesh, 11.9, 4.9)).toBe(true)
  expect(covers(mesh, -11.75, -5)).toBe(true)
})

test("bend labels remain upright and on the same side when endpoints reverse", () => {
  for (const end of [
    { x: 4, y: 0 },
    { x: -4, y: 8 },
    { x: 4, y: 8 },
  ]) {
    const original = { ...bend, end }
    const reverse = { ...original, start: original.end, end: original.start }
    const dx = end.x - bend.start.x,
      dy = end.y - bend.start.y
    const labelVertices = (b: PcbBend) => {
      const mesh = compileCircuitJson([board, b]).layers.find(
        (l) => l.name === "bend",
      )!.paint
      const points = []
      for (let i = 0; i < mesh.vertices.length; i += 8) {
        const x = mesh.vertices[i],
          y = mesh.vertices[i + 1]
        const distance =
          Math.abs(dx * (y - 10) - dy * (x - 16)) / Math.hypot(dx, dy)
        if (distance > 0.1) points.push([x, y])
      }
      return points
    }
    const forward = labelVertices(original),
      backward = labelVertices(reverse)
    expect(forward.length).toBeGreaterThan(0)
    expect(backward).toEqual(forward)
  }
})

test("a short zero-angle bend still has a finite line and a fitted label", () => {
  const scene = compileCircuitJson([
    board,
    { ...bend, start: { x: 0, y: 0 }, end: { x: 0.5, y: 0 }, bend_angle: 0 },
  ])
  expect(scene.diagnostics).toEqual([])
  const mesh = scene.layers.find((l) => l.name === "bend")!.paint
  const xs = [...mesh.vertices].filter((_, i) => i % 8 === 0)
  expect(Math.min(...xs)).toBeGreaterThanOrEqual(20)
  expect(Math.max(...xs)).toBeLessThanOrEqual(20.5)
  expect(covers(mesh, 20.25, 10)).toBe(true)
})

test("missing board references are omitted like the SVG overlay", () => {
  const scene = compileCircuitJson([bend])
  expect(scene.diagnostics).toEqual([])
  expect(scene.triangleCount).toBe(0)
})

test("invalid bend endpoints still report a diagnostic", () => {
  for (const end of [
    bend.start,
    { x: Number.NaN, y: 0 },
    { x: Infinity, y: 0 },
  ]) {
    const scene = compileCircuitJson([board, { ...bend, end }])
    expect(scene.diagnostics).toEqual([
      {
        elementId: "bend",
        type: "pcb_bend",
        message: "Error: Bend centerline endpoints must be finite and distinct",
      },
    ])
  }
})

test("cutouts do not erase a mechanical bend annotation", () => {
  const scene = compileCircuitJson([
    board,
    bend,
    {
      type: "pcb_cutout",
      pcb_cutout_id: "cut",
      shape: "rect",
      center: { x: 20, y: 10 },
      width: 2,
      height: 2,
    },
  ])
  expect(scene.diagnostics).toEqual([])
  expect(
    scene.layers.find((l) => l.name === "bend")!.erase.indices.length,
  ).toBe(0)
})
