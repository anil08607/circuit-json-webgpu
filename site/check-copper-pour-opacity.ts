import { CircuitToWebGpuDrawer, type CircuitJson } from "../lib"

export async function checkCopperPourOpacity() {
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 200
  const drawer = await CircuitToWebGpuDrawer.create(canvas)
  const elements = [
    ...["top", "bottom", "inner1"].map((layer, i) => ({
      type: "pcb_copper_pour",
      pcb_copper_pour_id: `pour_${layer}`,
      shape: "rect",
      layer,
      center: { x: -6 + i * 6, y: 0 },
      width: 4,
      height: 4,
    })),
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pad",
      shape: "rect",
      layer: "top",
      x: -6,
      y: 0,
      width: 1,
      height: 1,
    },
    {
      type: "pcb_trace",
      pcb_trace_id: "trace",
      route: [
        { route_type: "wire", layer: "top", x: -8, y: 5, width: 1 },
        { route_type: "wire", layer: "top", x: 8, y: 5, width: 1 },
      ],
    },
    {
      type: "pcb_trace",
      pcb_trace_id: "overlap_trace",
      route: [
        { route_type: "wire", layer: "top", x: -7, y: 1, width: 0.4 },
        { route_type: "wire", layer: "top", x: -5, y: 1, width: 0.4 },
      ],
    },
    {
      type: "pcb_via",
      pcb_via_id: "tented_via",
      x: 0,
      y: -5,
      layers: ["top", "bottom"],
      outer_diameter: 1,
      hole_diameter: 0.5,
      tented_on_top: true,
      tented_on_bottom: false,
    },
  ] as CircuitJson
  const frames: Record<string, string> = {}
  const capture = (name: string) => {
    frames[name] = canvas.toDataURL("image/png").split(",")[1]
  }
  try {
    drawer.drawElements(elements, {
      transform: { a: 10, b: 0, c: 0, d: -10, e: 100, f: 100 },
      hiddenLayerOpacity: 0.4,
    })
    capture("default")
    for (const [name, opacity] of Object.entries({
      half: 0.5,
      zero: 0,
      negative: -1,
      aboveOne: 2,
      nan: Number.NaN,
    })) {
      drawer.render({ copperPourOpacity: opacity })
      capture(name)
    }
    drawer.render({ copperPourOpacity: 0.5 })
    drawer.render({ transform: drawer.realToCanvasMat })
    capture("retained")
    drawer.render({ showCopperPours: false, copperPourOpacity: 1 })
    capture("hidden")
    drawer.render({ showCopperPours: true, copperPourOpacity: 0.5 })
    capture("shown")
    drawer.render({ xRayElementIds: ["pour_top"] })
    capture("xray")
    drawer.render({ copperPourOpacity: 0 })
    capture("xrayHidden")
    drawer.drawElements(elements, {
      transform: drawer.realToCanvasMat,
      hiddenLayerOpacity: 0.4,
    })
    capture("independent")
    drawer.render({ xRayElementIds: ["overlap_trace"], copperPourOpacity: 0 })
    capture("traceXray")
    drawer.render({ xRayElementIds: [], showSolderMask: true })
    capture("tentedTop")
    drawer.render({ selectedLayer: "bottom" })
    capture("exposedBottom")
    drawer.render({ selectedLayer: "top", showSolderMask: false })
    capture("maskOff")
    drawer.render({ showSolderMask: true, xRayElementIds: ["tented_via"] })
    capture("viaXray")
    return { frames, geometryUploads: drawer.stats.geometryUploads }
  } finally {
    drawer.dispose()
  }
}
