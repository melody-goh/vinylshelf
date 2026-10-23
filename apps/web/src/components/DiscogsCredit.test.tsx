import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DiscogsCredit } from './DiscogsCredit';

describe('DiscogsCredit', () => {
  it('links "Data provided by Discogs" to the record on Discogs, safely in a new tab', () => {
    render(<DiscogsCredit href="https://www.discogs.com/release/42" />);

    const link = screen.getByRole('link', { name: 'Discogs' });
    expect(link.closest('p')).toHaveTextContent('Data provided by Discogs');
    expect(link).toHaveAttribute('href', 'https://www.discogs.com/release/42');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
