interface ProcessingProgressProps {
  current: number
  total: number
}

export function ProcessingProgress({ current, total }: ProcessingProgressProps) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div>
      <progress value={current} max={total} data-testid="progress-bar" />
      <span>{percent}%</span>
    </div>
  )
}
