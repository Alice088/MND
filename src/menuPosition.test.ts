import { describe, it, expect } from 'vitest'
import {
  levelHeight, computeTops, firstItemY,
  computeBaseX, computeLefts,
  MENU_W, GAP
} from './menuPosition'

/** Real app: level 0 = 1 item (Create), level 1 = 5 items, level 2 = 2 items */
function lv(d: number, n: number) { return { depth: d, itemCount: n } }

describe('levelHeight', () => {
  it('level 0 + 1 item = GAP+HEADER+ITEM+GAP = 70', () => expect(levelHeight(0, 1)).toBe(70))
  it('level 1 + 5 items = GAP+5*ITEM+GAP = 176', () => expect(levelHeight(1, 5)).toBe(176))
  it('level 1 + 2 items = 80', () => expect(levelHeight(1, 2)).toBe(80))
})

// ─── Vertical: level 0 first item at cursor Y, submenus align to parent ───

describe('computeTops: level 0 first item at cursor Y', () => {
  it('1 level (just Create), cursor 400, first item at 400', () => {
    const tops = computeTops(400, 720, [lv(0, 1)], [])
    expect(firstItemY(tops, [0])[0]).toBe(400)
  })

  it('2 levels, openStack[0]=0 (Create), level 1 aligns with item 0 of level 0', () => {
    const levels = [lv(0, 1), lv(1, 5)]
    const tops = computeTops(400, 720, levels, [0])
    const fys = firstItemY(tops, [0, 1])
    expect(fys[0]).toBe(400)
    expect(fys[1]).toBe(400)
  })

  it('3 levels, openStack=[0,4], level 2 aligns with item 4 (Shape) of level 1', () => {
    const levels = [lv(0, 1), lv(1, 5), lv(1, 2)]
    const tops = computeTops(400, 720, levels, [0, 4])
    const fys = firstItemY(tops, [0, 1, 1])
    expect(fys[0]).toBe(400)
    expect(fys[1]).toBe(400)
    expect(fys[2]).toBe(528)
  })
})

describe('computeTops: near bottom, uniform shift', () => {
  it('1 level near bottom, fits in viewport', () => {
    const tops = computeTops(700, 720, [lv(0, 1)], [])
    expect(tops[0]).toBeGreaterThanOrEqual(GAP)
    expect(tops[0] + levelHeight(0, 1)).toBeLessThanOrEqual(720 - GAP + 0.01)
  })

  it('3 levels near bottom, uniform shift preserves relative positions', () => {
    const levels = [lv(0, 1), lv(1, 5), lv(1, 2)]
    const tops = computeTops(700, 720, levels, [0, 4])
    for (let i = 0; i < levels.length; i++) {
      expect(tops[i]).toBeGreaterThanOrEqual(GAP - 0.01)
      expect(tops[i] + levelHeight(levels[i].depth, levels[i].itemCount))
        .toBeLessThanOrEqual(720 - GAP + 0.01)
    }
    const shapeY = tops[1] + 4 + 4 * 32
    const fys = firstItemY(tops, [0, 1, 1])
    expect(fys[2]).toBe(shapeY)
  })

  it('all Y positions within viewport bounds', () => {
    for (let y = 0; y <= 720; y += 5) {
      const levels = [lv(0, 1), lv(1, 5), lv(1, 2)]
      const tops = computeTops(y, 720, levels, [0, 4])
      for (let i = 0; i < levels.length; i++) {
        const b = tops[i] + levelHeight(levels[i].depth, levels[i].itemCount)
        expect(tops[i]).toBeGreaterThanOrEqual(GAP - 0.01)
        expect(b).toBeLessThanOrEqual(720 - GAP + 0.01)
      }
    }
  })

  it('no NaN for any Y', () => {
    for (let y = 0; y <= 720; y += 5) {
      const levels = [lv(0, 1), lv(1, 5), lv(1, 2)]
      const tops = computeTops(y, 720, levels, [0, 4])
      for (const t of tops) { expect(isNaN(t)).toBe(false); expect(isFinite(t)).toBe(true) }
    }
  })
})

// ─── Horizontal: deepest level left edge at cursor X ───

describe('computeBaseX: deepest level at cursor X', () => {
  it('1 level → base = cursorX (no shift)', () => {
    expect(computeBaseX(500, 1200, 1)).toBe(500)
  })

  it('2 levels → base = cursorX - 170, level 1 at cursorX', () => {
    const bx = computeBaseX(500, 1200, 2)
    expect(bx).toBe(500 - MENU_W)
    expect(bx + MENU_W).toBe(500)
  })

  it('3 levels → base = cursorX - 340, level 2 at cursorX', () => {
    const bx = computeBaseX(500, 1200, 3)
    expect(bx).toBe(500 - 2 * MENU_W)
    expect(bx + 2 * MENU_W).toBe(500)
  })

  it('clamp right edge: deepest overflows → shift left', () => {
    // 3 levels, cursorX=1150, vpW=1200: deepest right = 1150+170=1320 > 1192 → shift
    // maxBase = 1200-8-510 = 682
    // desired = 1150-340 = 810 → clamp to 682
    const bx = computeBaseX(1150, 1200, 3)
    expect(bx + 3 * MENU_W).toBeLessThanOrEqual(1200 - GAP)
  })

  it('clamp left edge: base < GAP', () => {
    // 3 levels, cursorX=50: desired = 50-340 = -290
    // minBase = 8, clamp to 8
    expect(computeBaseX(50, 1200, 3)).toBe(GAP)
  })
})

describe('computeLefts', () => {
  it('cascade right from base', () => {
    expect(computeLefts(300, 3)).toEqual([300, 470, 640])
  })
})
