interface FileUploadProps {
  onFileSelected: (file: File) => void
  disabled?: boolean
}

export function FileUpload({ onFileSelected, disabled }: FileUploadProps) {
  return (
    <input
      type="file"
      accept="video/mp4,video/quicktime"
      disabled={disabled}
      data-testid="file-upload-input"
      onChange={(e) => {
        const file = e.target.files?.[0]
        if (file) onFileSelected(file)
      }}
    />
  )
}
