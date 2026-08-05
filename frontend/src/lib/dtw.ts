export interface DtwResult {
  path: [number, number][]
  cost: number
}

function euclideanDistance(a: number[], b: number[]): number {
  let sumSquares = 0
  for (let k = 0; k < a.length; k++) {
    const diff = a[k] - b[k]
    sumSquares += diff * diff
  }
  return Math.sqrt(sumSquares)
}

/**
 * Standard O(n*m) dynamic time warping. Local cost is Euclidean distance
 * between rows — no per-dimension normalization (see the milestone-3 design
 * doc for why that matters when rows come from computeFeatureVectors).
 *
 * ponytail: no Sakoe-Chiba warping-window constraint — unconstrained DTW.
 * Fine for clips of comparable length/phase; add a window if very
 * different-length clips produce pathological alignments in practice.
 */
export function dtw(seqA: number[][], seqB: number[][]): DtwResult {
  const n = seqA.length
  const m = seqB.length
  if (n === 0 || m === 0) return { path: [], cost: 0 }

  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(Infinity))
  cost[0][0] = 0

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const d = euclideanDistance(seqA[i - 1], seqB[j - 1])
      cost[i][j] = d + Math.min(cost[i - 1][j], cost[i][j - 1], cost[i - 1][j - 1])
    }
  }

  // cost[0][j>0] and cost[i>0][0] are Infinity, so the only way to reach row/
  // column 0 is the diagonal step from (1,1) to (0,0) — i and j always hit 0
  // on the same iteration, so this loop never needs a separate edge case.
  const path: [number, number][] = []
  let i = n
  let j = m
  while (i > 0 && j > 0) {
    path.push([i - 1, j - 1])
    const diag = cost[i - 1][j - 1]
    const up = cost[i - 1][j]
    const left = cost[i][j - 1]
    if (diag <= up && diag <= left) {
      i--
      j--
    } else if (up < left) {
      i--
    } else {
      j--
    }
  }
  path.reverse()

  return { path, cost: cost[n][m] }
}
