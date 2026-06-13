// Pure positioning math for context menu
// Each new level opens with its first item at the cursor's click position.
// Parent levels shift uniformly to accommodate.

export const MENU_W = 170
export const ITEM_H = 32
export const HEADER_H = 22
export const LV0_FIRST = 30  // level 0: menu top → first item Y offset (header)
export const LVN_FIRST = 4   // level N: menu top → first item Y offset (no header)
export const GAP = 8
export const MENU_X_OFFSET = -12  // shift menu left so cursor lands inside, not on edge
export const MENU_Y_OFFSET = -6   // shift menu up so cursor lands on first item

export interface LevelInfo {
  depth: number
  itemCount: number
}

export interface ClickPos {
  x: number
  y: number
}

export function levelHeight(depth: number, itemCount: number): number {
  return GAP + (depth === 0 ? HEADER_H : 0) + itemCount * ITEM_H + GAP
}

/**
 * Vertical positioning.
 * Level 0: first item at cursorY (right-click Y).
 * Level N (N>0): first item at clickY[N] (Y when item was clicked to open this level).
 * All levels share uniform viewport-clamping shift.
 */
export function computeTops(
  cursorY: number,       // original right-click Y
  vpH: number,
  levels: LevelInfo[],
  clickYs: number[],     // [cursorY, clickY_for_level1, clickY_for_level2, ...]
): number[] {
  const N = levels.length
  if (N === 0) return []

  const ideal: number[] = []

  // Level 0: first item slightly above cursor Y (MENU_Y_OFFSET)
  ideal[0] = cursorY - LV0_FIRST + MENU_Y_OFFSET

  // Level N: first item at click Y that opened this level
  for (let d = 1; d < N; d++) {
    const clickY = clickYs[d] ?? cursorY
    ideal[d] = clickY - LVN_FIRST + MENU_Y_OFFSET
  }

  // Uniform shift to fit viewport
  const bottomLimit = vpH - GAP
  const topLimit = GAP

  let lowestBottom = -Infinity
  for (let i = 0; i < N; i++) {
    const l = levels[i]
    const b = ideal[i] + levelHeight(l.depth, l.itemCount)
    if (b > lowestBottom) lowestBottom = b
  }

  let shift = 0
  if (lowestBottom > bottomLimit) shift = bottomLimit - lowestBottom

  const shifted = ideal.map(t => t + shift)

  if (shifted[0] < topLimit) {
    const extra = topLimit - shifted[0]
    for (let i = 0; i < shifted.length; i++) shifted[i] += extra
  }

  let finalBottom = -Infinity
  for (let i = 0; i < N; i++) {
    const l = levels[i]
    const b = shifted[i] + levelHeight(l.depth, l.itemCount)
    if (b > finalBottom) finalBottom = b
  }
  if (finalBottom > bottomLimit) {
    const extra = bottomLimit - finalBottom
    for (let i = 0; i < shifted.length; i++) shifted[i] += extra
  }

  if (shifted[0] < topLimit) {
    const extra = topLimit - shifted[0]
    for (let i = 0; i < shifted.length; i++) shifted[i] += extra
  }

  return shifted
}

/** Y of first item in each level */
export function firstItemY(tops: number[], depths: number[]): number[] {
  return tops.map((t, i) => t + (depths[i] === 0 ? LV0_FIRST : LVN_FIRST))
}

/**
 * Horizontal: the DEEPEST level's LEFT EDGE is at its clickX.
 * All other levels cascade uniformly: level N at deepestLeft + (N - deepest) * MENU_W.
 * Clamped to viewport (no overflow).
 */
export function computeBaseX(
  cursorX: number,        // original right-click X (for level 0)
  vpW: number,
  totalLevels: number,
  clickXs: number[],      // [cursorX, clickX_for_level1, ...], length = totalLevels
): number {
  const deepestIdx = totalLevels - 1
  const deepestClickX = clickXs[deepestIdx] ?? cursorX

  // Level 0 left = deepestClickX - deepestIdx * MENU_W
  let base = deepestClickX - deepestIdx * MENU_W + MENU_X_OFFSET

  // Clamp to viewport
  const maxBase = vpW - GAP - totalLevels * MENU_W
  if (base < GAP) base = GAP
  if (maxBase < GAP) { base = GAP } // viewport too narrow
  else if (base > maxBase) base = maxBase

  return base
}

export function computeLefts(baseX: number, totalLevels: number): number[] {
  const result: number[] = []
  for (let d = 0; d < totalLevels; d++) {
    result.push(baseX + d * MENU_W)
  }
  return result
}
