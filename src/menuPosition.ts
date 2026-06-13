// Pure positioning math for context menu — cascading like Windows

export const MENU_W = 170
export const ITEM_H = 32
export const HEADER_H = 22
export const LV0_FIRST = 30  // level 0: menu top → first item Y offset (header)
export const LVN_FIRST = 4   // level N: menu top → first item Y offset (no header)
export const GAP = 8

export interface LevelInfo {
  depth: number
  itemCount: number
}

export function levelHeight(depth: number, itemCount: number): number {
  return GAP + (depth === 0 ? HEADER_H : 0) + itemCount * ITEM_H + GAP
}

/**
 * Compute vertical tops for all levels.
 *
 * Level 0: first item at cursor Y.
 * Level N (submenu): first item aligned to the parent item that opened it.
 *   Parent item Y = top[parentDepth] + FIRST_OFFSET(parentDepth) + openStack[parentDepth] * ITEM_H
 *   Level N top = parentItemY - LVN_FIRST
 *
 * All levels move as ONE BLOCK when viewport overflow occurs.
 * Uniform shift: same delta applied to every level's top.
 */
export function computeTops(
  cursorY: number,
  vpH: number,
  levels: LevelInfo[],
  openStack: number[],
): number[] {
  const N = levels.length
  if (N === 0) return []

  const ideal: number[] = []

  // Level 0: first item at cursor Y
  ideal[0] = cursorY - LV0_FIRST

  // Level N: align to parent item
  for (let d = 1; d < N; d++) {
    const parentDepth = d - 1
    const parentItemIdx = openStack[parentDepth] ?? 0
    const parentFirstOffset = parentDepth === 0 ? LV0_FIRST : LVN_FIRST
    const parentItemY = ideal[parentDepth] + parentFirstOffset + parentItemIdx * ITEM_H
    ideal[d] = parentItemY - LVN_FIRST
  }

  // Compute span
  const bottomLimit = vpH - GAP
  const topLimit = GAP

  // Apply uniform shift if overflow below
  let lowestBottom = -Infinity
  for (let i = 0; i < N; i++) {
    const l = levels[i]
    const b = ideal[i] + levelHeight(l.depth, l.itemCount)
    if (b > lowestBottom) lowestBottom = b
  }

  let shift = 0
  if (lowestBottom > bottomLimit) shift = bottomLimit - lowestBottom

  const shifted = ideal.map(t => t + shift)

  // Clamp top to GAP
  if (shifted[0] < topLimit) {
    const extra = topLimit - shifted[0]
    for (let i = 0; i < shifted.length; i++) shifted[i] += extra
  }

  // Re-check bottom after clamp
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

  // Final top clamp
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
 * Horizontal: DEEPEST level's LEFT EDGE at cursor X.
 * Cascade left: base level at cursorX - MENU_W * (totalLevels - 1).
 * Each subsequent level is MENU_W to the right.
 * Clamped so no level overflows viewport.
 */
export function computeBaseX(cursorX: number, vpW: number, totalLevels: number): number {
  // deepest level left = cursorX, base = shift back by (totalLevels-1) * MENU_W
  let base = cursorX - MENU_W * (totalLevels - 1)
  // clamp so no level overflows left or right
  const minBase = GAP
  const maxBase = vpW - GAP - totalLevels * MENU_W
  if (base < minBase) base = minBase
  if (maxBase < minBase) { base = minBase } // viewport too narrow, just clamp
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
