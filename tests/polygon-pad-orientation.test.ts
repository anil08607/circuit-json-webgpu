import { expect, test } from "bun:test"
import { pcb_plated_hole } from "circuit-json"
import { compileCircuitJson } from "../lib"
import { meshBounds, meshCovers } from "./fixtures/mesh-geometry"

test("polygon pad outlines rotate once around their anchor", () => {
  for (const ccw_rotation of [0, 90, 180, 270]) {
    const hole = pcb_plated_hole.parse({
      type: "pcb_plated_hole",
      pcb_plated_hole_id: "oriented-polygon",
      shape: "hole_with_polygon_pad",
      x: 5,
      y: 5,
      pad_outline: [
        { x: -1, y: -3 },
        { x: 1, y: -3 },
        { x: 1, y: 3 },
        { x: -1, y: 3 },
      ],
      ccw_rotation,
      hole_shape: "circle",
      hole_diameter: 0.5,
      layers: ["top", "bottom"],
    })
    const scene = compileCircuitJson([hole])
    expect(scene.diagnostics).toEqual([])
    const mesh = scene.layers.find((layer) => layer.name === "top")!.paint
    const vertical = ccw_rotation % 180 === 0
    expect(meshBounds(mesh)).toEqual(vertical ? [4, 6, 2, 8] : [2, 8, 4, 6])
    for (const { point, copper } of [
      { point: { x: 5.5, y: 7 }, copper: vertical },
      { point: { x: 4.5, y: 3 }, copper: vertical },
      { point: { x: 7, y: 5 }, copper: !vertical },
      { point: { x: 3, y: 5 }, copper: !vertical },
    ]) {
      expect(meshCovers({ mesh, point })).toBe(copper)
    }
  }
})
