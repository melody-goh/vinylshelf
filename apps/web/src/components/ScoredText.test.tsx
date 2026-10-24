import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScoredText } from './ScoredText';

describe('ScoredText', () => {
  it('gives assistive tech the sentence once, not letter by letter', () => {
    render(<ScoredText text="Waking up the shelf…" />);

    const status = screen.getByRole('status');
    expect(screen.getByText('Waking up the shelf…')).toHaveClass('sr-only');
    expect(status.querySelectorAll('[data-letter]')).toHaveLength('Wakinguptheshelf…'.length);
    expect(status.querySelector('[data-letter]')?.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});
