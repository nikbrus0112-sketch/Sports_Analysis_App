import { describe, expect, it } from 'vitest'

describe('toolchain sanity', () => {
  it('runs TypeScript test files under Vitest', () => {
    expect(1 + 1).toBe(2)
  })
})
