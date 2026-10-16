import { fillEvenOdd } from "./fill-even-odd"
import { MeshBuilder, rotate } from "../geometry"
import type { Point } from "../types"
import { getAlphabetLayout } from "circuit-to-canvas/lib/drawer/shapes/text/getAlphabetLayout"
import { getTextGeometry } from "circuit-to-canvas/lib/drawer/shapes/text/getTextStartPosition"

/** Layout matches circuit-to-canvas; only the final primitive sink is GPU triangles. */
export function drawText(
  mesh: MeshBuilder,
  e: Record<string, any>,
  yAxis: "up" | "down" = "up",
) {
  const text = String(e.text ?? "")
  if (!text) return
  const c = e.anchor_position ?? e.center ?? { x: e.x ?? 0, y: e.y ?? 0 }
  const fontSize = e.font_size ?? 1
  const layout = getAlphabetLayout(text, fontSize)
  const geometry = getTextGeometry(
    e.anchor_alignment ?? "center",
    layout,
    fontSize,
  )
  const isNote = e.type === "pcb_note_text"
  const isFabrication = e.type === "pcb_fabrication_note_text"
  const mirrored = isFabrication
    ? false
    : isNote
      ? (e.is_mirrored_from_top_view ?? e.layer === "bottom")
      : e.type === "pcb_silkscreen_text"
        ? e.layer === "bottom" || e.is_mirrored === true
        : (e.is_mirrored ?? e.layer === "bottom")
  const rotation = isNote || isFabrication ? 0 : (e.ccw_rotation ?? 0)
  const sign = yAxis === "up" ? -1 : 1
  const transform = (p: Point) =>
    rotate(
      { x: c.x + (mirrored ? -p.x : p.x), y: c.y + sign * p.y },
      c,
      -sign * rotation,
    )
  if (e.is_knockout && !isNote && !isFabrication) {
    const b = geometry.bounds
    if (!b) return
    const isSilkscreen = e.type === "pcb_silkscreen_text"
    const p = {
      left: e.knockout_padding?.left ?? (isSilkscreen ? fontSize * 0.5 : 0.2),
      right: e.knockout_padding?.right ?? (isSilkscreen ? fontSize * 0.5 : 0.2),
      top: e.knockout_padding?.top ?? (isSilkscreen ? fontSize * 0.3 : 0.2),
      bottom:
        e.knockout_padding?.bottom ?? (isSilkscreen ? fontSize * 0.3 : 0.2),
    }
    const outer = [
      { x: b.minX - p.left, y: b.minY - p.top },
      { x: b.maxX + p.right, y: b.minY - p.top },
      { x: b.maxX + p.right, y: b.maxY + p.bottom },
      { x: b.minX - p.left, y: b.maxY + p.bottom },
    ]
    const alignment = e.anchor_alignment ?? "center"
    const offset = {
      x: -(/_left$/.test(alignment)
        ? outer[0].x
        : /_right$/.test(alignment)
          ? outer[1].x
          : (outer[0].x + outer[1].x) / 2),
      y: -(/^top_/.test(alignment)
        ? outer[0].y
        : /^bottom_/.test(alignment)
          ? outer[2].y
          : (outer[0].y + outer[2].y) / 2),
    }
    const align = (point: Point) =>
      transform({
        x: point.x + (isSilkscreen ? offset.x : 0),
        y: point.y + (isSilkscreen ? offset.y : 0),
      })
    fillEvenOdd(mesh, [
      outer.map(align),
      ...geometry.glyphGroups.flatMap((group) =>
        group.map((ring) => ring.map(align)),
      ),
    ])
    return
  }
  // Alphabet outlines describe the union of each glyph's round strokes. Filling
  // once avoids alpha accumulating at segment joins in translucent note text.
  for (const group of geometry.glyphGroups)
    fillEvenOdd(
      mesh,
      group.map((ring) => ring.map(transform)),
    )
}
