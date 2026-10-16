import polygonClipping, { type Polygon } from "polygon-clipping"
import type { Point } from "./types"

/** Subtract filled pour regions while preserving clearance holes. Bounds and
 * containment fast paths avoid clipping every segment against a whole board.
 */
export function createTraceClipper(
  inputs: { layer: string; rings: Point[][] }[],
) {
  const bounds = (ring: Point[]) =>
    ring.reduce(
      (b, p) => ({
        minX: Math.min(b.minX, p.x),
        minY: Math.min(b.minY, p.y),
        maxX: Math.max(b.maxX, p.x),
        maxY: Math.max(b.maxY, p.y),
      }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    )
  type BoundedRing = {
    points: Polygon[number]
    bounds: ReturnType<typeof bounds>
  }
  const pours = new Map<string, BoundedRing[][]>()
  for (const { layer, rings } of inputs) {
    const layerPours = pours.get(layer) ?? []
    layerPours.push(
      rings.map((ring) => ({
        points: ring.map((p) => [p.x, p.y]),
        bounds: bounds(ring),
      })),
    )
    pours.set(layer, layerPours)
  }
  // undefined means unchanged; an empty array means completely covered.
  return (layer: string, ring: Point[]): Point[][][] | undefined => {
    const box = bounds(ring)
    const containsPoint = (r: Polygon[number], x: number, y: number) => {
      let result = false
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [ax, ay] = r[i],
          [bx, by] = r[j]
        if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax)
          result = !result
      }
      return result
    }
    const traceRing: Polygon[number] = ring.map((p) => [p.x, p.y])
    const intersects = (b: ReturnType<typeof bounds>) =>
      b.minX <= box.maxX &&
      b.maxX >= box.minX &&
      b.minY <= box.maxY &&
      b.maxY >= box.minY
    // Distant holes cannot affect this trace. Excluding them keeps large board
    // compilation proportional to nearby geometry instead of every pour hole.
    let covered = false
    const layerPours = (pours.get(layer) ?? [])
      .filter((pour) => pour[0] && intersects(pour[0].bounds))
      .map((pour) =>
        pour
          .filter((r, i) => i === 0 || intersects(r.bounds))
          .map((r) => r.points),
      )
      .filter((pour) => {
        // No nearby boundary means the trace is entirely covered or clear.
        // Most routed segments lie wholly inside clearance holes.
        const boundary = pour.some(
          (r) =>
            containsPoint(traceRing, r[0][0], r[0][1]) ||
            r.some(([x, y], i) => {
              const [bx, by] = r[(i + 1) % r.length]
              if (
                !(
                  Math.min(x, bx) <= box.maxX &&
                  Math.max(x, bx) >= box.minX &&
                  Math.min(y, by) <= box.maxY &&
                  Math.max(y, by) >= box.minY
                )
              )
                return false
              return ring.some((p, j) => {
                const q = ring[(j + 1) % ring.length]
                const cross = (
                  ax: number,
                  ay: number,
                  cx: number,
                  cy: number,
                  dx: number,
                  dy: number,
                ) => (cx - ax) * (dy - ay) - (cy - ay) * (dx - ax)
                return (
                  Math.min(p.x, q.x) <= Math.max(x, bx) &&
                  Math.max(p.x, q.x) >= Math.min(x, bx) &&
                  Math.min(p.y, q.y) <= Math.max(y, by) &&
                  Math.max(p.y, q.y) >= Math.min(y, by) &&
                  cross(x, y, bx, by, p.x, p.y) *
                    cross(x, y, bx, by, q.x, q.y) <=
                    0 &&
                  cross(p.x, p.y, q.x, q.y, x, y) *
                    cross(p.x, p.y, q.x, q.y, bx, by) <=
                    0
                )
              })
            }),
        )
        if (boundary) return true
        const contains = (r: Polygon[number]) =>
          containsPoint(r, ring[0].x, ring[0].y)
        if (contains(pour[0]) && !pour.slice(1).some(contains)) covered = true
        return false
      })
    if (covered) return []
    if (!layerPours.length) return undefined
    return polygonClipping
      .difference([traceRing], ...layerPours)
      .map((polygon) => polygon.map((r) => r.map(([x, y]) => ({ x, y }))))
  }
}
