import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProcessingProgress } from './ProcessingProgress'

describe('ProcessingProgress', () => {
  it('renders the rounded percentage', () => {
    render(<ProcessingProgress current={30} total={120} />)
    expect(screen.getByText('25%')).toBeInTheDocument()
  })

  it('renders 0% when total is 0', () => {
    render(<ProcessingProgress current={0} total={0} />)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })
})
