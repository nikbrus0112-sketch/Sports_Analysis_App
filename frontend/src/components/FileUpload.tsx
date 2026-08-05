interface FileUploadProps {
  onFileSelected: (file: File) => void
  disabled?: boolean
  testId?: string
}

export function FileUpload({ onFileSelected, disabled, testId = 'file-upload-input' }: FileUploadProps) {
  return (
    <input
      type="file"
      accept="video/mp4,video/quicktime"
      disabled={disabled}
      data-testid={testId}
      onChange={(e) => {
        const file = e.target.files?.[0]
        if (file) onFileSelected(file)
      }}
    />
  )
}
