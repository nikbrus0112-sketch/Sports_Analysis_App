interface ProcessingProgressProps {
  current: number
  total: number
}

export function ProcessingProgress({ current, total }: ProcessingProgressProps) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <progress
        value={current}
        max={total}
        data-testid="progress-bar"
        className="h-2 w-full flex-1 accent-primary [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-card [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
      />
      <span className="w-12 text-right font-mono text-sm tabular-nums text-muted-foreground">{percent}%</span>
    </div>
  )
}
