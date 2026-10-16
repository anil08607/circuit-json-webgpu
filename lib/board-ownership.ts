import type { CircuitJson } from "./types"

/** Resolve nested subcircuits before applying a board's manufacturing defaults. */
export function createBoardOwnerMap(elements: CircuitJson) {
  type Element = Record<string, any>
  const boards = elements.filter((e) => e.type === "pcb_board")
  const owners = new Map<string, Element | undefined>()
  const parents = new Map<string, string | undefined>()
  for (const e of elements) {
    if (e.type === "source_group") {
      parents.set(
        e.source_group_id,
        e.subcircuit_id ?? e.parent_subcircuit_id ?? e.parent_source_group_id,
      )
      if (e.is_subcircuit && e.subcircuit_id)
        parents.set(
          e.subcircuit_id,
          e.parent_subcircuit_id ?? e.parent_source_group_id,
        )
    } else if (e.type === "pcb_group") {
      parents.set(e.pcb_group_id, e.subcircuit_id ?? e.source_group_id)
    } else if (e.type === "pcb_component") {
      parents.set(e.pcb_component_id, e.subcircuit_id ?? e.pcb_group_id)
    } else if (e.type === "pcb_trace") {
      parents.set(
        e.pcb_trace_id,
        e.subcircuit_id ?? e.pcb_group_id ?? e.pcb_component_id,
      )
    } else if (e.type === "pcb_via") {
      parents.set(
        e.pcb_via_id,
        e.subcircuit_id ?? e.pcb_group_id ?? e.pcb_trace_id,
      )
    }
  }
  for (const board of boards) {
    owners.set(board.pcb_board_id, board)
    if (board.subcircuit_id) owners.set(board.subcircuit_id, board)
  }
  const resolving = new Set<string>()
  function resolve(id: string): Element | undefined {
    if (owners.has(id)) return owners.get(id)
    if (resolving.has(id) || !parents.has(id)) return
    resolving.add(id)
    const parent = parents.get(id)
    const board = parent
      ? resolve(parent)
      : boards.length === 1
        ? boards[0]
        : undefined
    owners.set(id, board)
    resolving.delete(id)
    return board
  }
  for (const id of parents.keys()) resolve(id)
  return owners
}
