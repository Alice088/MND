import { describe, it, expect } from 'vitest'
import {
  levelHeight, computeTops, firstItemY,
  computeBaseX, computeLefts,
  GAP
} from './menuPosition'

/** Real app: level 0 = 1 item (Create), level 1 = 5 items, level 2 = 2 items */
function lv(d: number, n: number) { return { depth: d, itemCount: n } }

describe('levelHeight', () => {
  it('level 0 + 1 item = 70', () => expect(levelHeight(0, 1)).toBe(70))
  it('level 1 + 5 items = 176', () => expect(levelHeight(1, 5)).toBe(176))
  it('level 1 + 2 items = 80', () => expect(levelHeight(1, 2)).toBe(80))
})

// ─── Vertical: each level first item at its click Y ───

describe('computeTops: first item at click Y', () => {
  it('1 level, cursor 400 → first item 6px above cursor', () => {
    const tops = computeTops(400, 720, [lv(0, 1)], [400])
    expect(firstItemY(tops, [0])[0]).toBe(394)
  })

  it('2 levels: level 0 at 400, level 1 at 400 (same click)', () => {
    const tops = computeTops(400, 720, [lv(0, 1), lv(1, 5)], [400, 400])
    const fys = firstItemY(tops, [0, 1])
    expect(fys[0]).toBe(394)
    expect(fys[1]).toBe(394)
  })

  it('3 levels: level 0 at 400, level 1 at 400, level 2 at 528 → 6px above each clickY', () => {
    const tops = computeTops(400, 720, [lv(0, 1), lv(1, 5), lv(1, 2)], [400, 400, 528])
    const fys = firstItemY(tops, [0, 1, 1])
    expect(fys[0]).toBe(394)
    expect(fys[1]).toBe(394)
    expect(fys[2]).toBe(522)
  })
})

describe('computeTops: uniform viewport clamp', () => {
  it('all within bounds for various Y', () => {
    for (let y = 10; y <= 710; y += 10) {
      const levels = [lv(0, 1), lv(1, 5), lv(1, 2)]
      const tops = computeTops(y, 720, levels, [y, y, y + 100])
      for (let i = 0; i < levels.length; i++) {
        const b = tops[i] + levelHeight(levels[i].depth, levels[i].itemCount)
        expect(tops[i]).toBeGreaterThanOrEqual(GAP - 0.01)
        expect(b).toBeLessThanOrEqual(720 - GAP + 0.01)
      }
    }
  })

  it('no NaN', () => {
    for (let y = 0; y <= 720; y += 5) {
      const tops = computeTops(y, 720, [lv(0, 1), lv(1, 5), lv(1, 2)], [y, y, y + 50])
      for (const t of tops) { expect(isNaN(t)).toBe(false) }
    }
  })
})

// ─── Horizontal: deepest level left edge at its clickX ───

describe('computeBaseX: deepest level at its clickX', () => {
  it('1 level → base = cursorX - 12', () => {
    // MENU_X_OFFSET = -12 shifts left
    expect(computeBaseX(500, 1200, 1, [500])).toBe(488)
  })

  it('2 levels → level 1 at its clickX (800)', () => {
    // deepestIdx=1, deepestClickX=800
    // base = 800 - 1*170 - 12 = 618
    const bx = computeBaseX(500, 1200, 2, [500, 800])
    expect(bx).toBe(618)
    // level 1 left = 618 + 170 = 788
  })

  it('3 levels → level 2 at its clickX (960)', () => {
    // deepestIdx=2, deepestClickX=960
    // base = 960 - 2*170 - 12 = 608
    const bx = computeBaseX(500, 1200, 3, [500, 670, 960])
    expect(bx).toBe(608)
    // level 1 = 608+170 = 778, level 2 = 608+340 = 948
  })

  it('overflow right: clamp', () => {
    // 3 levels, deepestClickX=1150, vpW=1200
    // base = 1150 - 340 = 810
    // maxBase = 1200 - 8 - 510 = 682
    // clamp to 682
    const bx = computeBaseX(500, 1200, 3, [500, 670, 1150])
    expect(bx + 3 * 170).toBeLessThanOrEqual(1200 - GAP)
    expect(bx).toBe(682)
  })

  it('overflow left: clamp to GAP', () => {
    // narrow viewport, deepestClickX=50
    // base = 50 - 340 = -290 → clamp to 8
    const bx = computeBaseX(50, 400, 3, [50, 50, 50])
    expect(bx).toBe(GAP)
  })
})

describe('computeLefts', () => {
  it('cascade from base', () => {
    expect(computeLefts(300, 3)).toEqual([300, 470, 640])
  })
})
