import { expect, test } from "bun:test"
import { compileCircuitJson } from "../lib"
import { jaeShellPad } from "./fixtures/jae-shell-pad"
import { meshBounds } from "./fixtures/mesh-geometry"

for (const { rotation, copper, center } of [
  { rotation: 0, copper: [8.8, 10.55, 4.45, 6.75], center: [9.4, 5.6] },
  { rotation: 90, copper: [8.25, 10.55, 3.8, 5.55], center: [9.4, 4.4] },
  { rotation: -90, copper: [9.45, 11.75, 4.45, 6.2], center: [10.6, 5.6] },
  { rotation: 180, copper: [9.45, 11.2, 3.25, 5.55], center: [10.6, 4.4] },
  {
    rotation: 30,
    copper: [8.085769515, 10.751313972, 3.923686028, 6.515544457],
    center: [9.180384758, 5.219615242],
  },
]) {
  const regression = test
  regression(
    `JAE shell copper, drill and mask follow ${rotation}° placement`,
    () => {
      const element = { ...jaeShellPad, ccw_rotation: rotation }
      const original = structuredClone(element)
      const scene = compileCircuitJson([element])
      expect(scene.diagnostics).toEqual([])
      expect(scene.elementIds).toEqual([element.pcb_plated_hole_id])
      const expectedCopper = copper.map((value) => expect.closeTo(value, 3))
      for (const name of ["top", "bottom"]) {
        const layer = scene.layers.find((layer) => layer.name === name)!
        expect(meshBounds(layer.paint)).toEqual(expectedCopper)
        const [minX, maxX, minY, maxY] = meshBounds(layer.erase)
        expect((minX + maxX) / 2).toBeCloseTo(center[0], 3)
        expect((minY + maxY) / 2).toBeCloseTo(center[1], 3)
        expect(
          meshBounds(
            scene.layers.find((layer) => layer.name === `soldermask_${name}`)!
              .erase,
          ),
        ).toEqual(expectedCopper)
      }
      expect(element).toEqual(original)
    },
  )
}

test.each(["circle", "oval", "rotated_pill"] as const)(
  "polygon-pad %s drill offsets rotate with the pad",
  (hole_shape) => {
    const scene = compileCircuitJson([
      { ...jaeShellPad, hole_shape, hole_diameter: 0.6, ccw_rotation: 90 },
    ])
    expect(scene.diagnostics).toEqual([])
    const [minX, maxX, minY, maxY] = meshBounds(
      scene.layers.find((layer) => layer.name === "drill")!.paint,
    )
    expect((minX + maxX) / 2).toBeCloseTo(9.4, 3)
    expect((minY + maxY) / 2).toBeCloseTo(4.4, 3)
  },
)

test("an omitted polygon-pad rotation preserves the footprint", () => {
  const original = structuredClone(jaeShellPad)
  const scene = compileCircuitJson([jaeShellPad])
  expect(scene.diagnostics).toEqual([])
  expect(
    meshBounds(scene.layers.find((layer) => layer.name === "top")!.paint),
  ).toEqual([8.8, 10.55, 4.45, 6.75].map((value) => expect.closeTo(value, 3)))
  expect(jaeShellPad).toEqual(original)
})
