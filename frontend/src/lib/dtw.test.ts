import { describe, expect, it } from 'vitest'
import { dtw } from './dtw'

describe('dtw', () => {
  it('returns an empty path and zero cost for an empty input sequence', () => {
    expect(dtw([], [[1]])).toEqual({ path: [], cost: 0 })
  })

  it('handles a single frame on each side: cost is the direct distance, path is [[0,0]]', () => {
    expect(dtw([[0]], [[3]])).toEqual({ path: [[0, 0]], cost: 3 })
  })

  it('aligns identical (strictly monotonic) sequences with an identity path and zero cost', () => {
    const seq = [[0], [1], [2], [3]]
    const result = dtw(seq, seq)
    expect(result.cost).toBeCloseTo(0, 10)
    expect(result.path).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ])
  })

  it('aligns a stretched sequence with a many-to-one path on the longer side', () => {
    const seqA = [[0], [1], [2]]
    const seqB = [[0], [0], [1], [1], [2], [2]] // each seqA value repeated twice
    const result = dtw(seqA, seqB)
    expect(result.cost).toBeCloseTo(0, 10)
    expect(result.path).toEqual([
      [0, 0],
      [0, 1],
      [1, 2],
      [1, 3],
      [2, 4],
      [2, 5],
    ])
  })

  it('aligns a compressed sequence with a many-to-one path on the longer side (mirror of the stretched case)', () => {
    const seqA = [[0], [0], [1], [1], [2], [2]]
    const seqB = [[0], [1], [2]]
    const result = dtw(seqA, seqB)
    expect(result.cost).toBeCloseTo(0, 10)
    expect(result.path).toEqual([
      [0, 0],
      [1, 0],
      [2, 1],
      [3, 1],
      [4, 2],
      [5, 2],
    ])
  })
})
