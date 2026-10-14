import { describe, expect, it } from 'vitest'
import { splitChips } from './ChipAnimations'

describe('筹码面额拆分', () => {
  it('严格按实际面额组成下注金额', () => {
    expect(splitChips(4030).map(({ value, count }) => [value, count])).toEqual([[1000, 4], [20, 1], [10, 1]])
  })

  it('大额筹码不限制显示数量', () => {
    expect(splitChips(20000)).toMatchObject([{ value: 1000, count: 20 }])
  })

  it('平分底池产生零头时仍保持金额完全一致', () => {
    const amount = 137
    expect(splitChips(amount).reduce((sum, chip) => sum + chip.value * chip.count, 0)).toBe(amount)
  })
})
