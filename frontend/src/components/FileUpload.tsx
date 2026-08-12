interface FileUploadProps {
  onFileSelected: (file: File) => void
  disabled?: boolean
  testId?: string
}

export function FileUpload({ onFileSelected, disabled, testId = 'file-upload-input' }: FileUploadProps) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-primary/10 focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background ${
        disabled ? 'cursor-not-allowed opacity-50' : ''
      }`}
    >
      Choose video file
      <input
        type="file"
        accept="video/mp4,video/quicktime"
        disabled={disabled}
        data-testid={testId}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFileSelected(file)
        }}
      />
    </label>
  )
}
