import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FileUpload } from './FileUpload'

describe('FileUpload', () => {
  it('calls onFileSelected when a file is chosen', async () => {
    const onFileSelected = vi.fn()
    render(<FileUpload onFileSelected={onFileSelected} />)

    const input = screen.getByTestId('file-upload-input')
    const file = new File(['dummy'], 'clip.mp4', { type: 'video/mp4' })
    await userEvent.upload(input, file)

    expect(onFileSelected).toHaveBeenCalledWith(file)
  })

  it('disables the input when disabled is true', () => {
    render(<FileUpload onFileSelected={vi.fn()} disabled />)
    expect(screen.getByTestId('file-upload-input')).toBeDisabled()
  })

  it('uses a custom data-testid when provided', () => {
    render(<FileUpload onFileSelected={vi.fn()} testId="reference-file-upload-input" />)
    expect(screen.getByTestId('reference-file-upload-input')).toBeInTheDocument()
  })
})
