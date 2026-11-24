import { useState } from 'react';
import { screen } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary.jsx';
import { renderWithProviders } from '../test/utils.jsx';

let shouldThrow = true;

function Fragile() {
  const [label] = useState('Recovered content');
  if (shouldThrow) {
    throw new Error('render failure');
  }
  return <p>{label}</p>;
}

describe('ErrorBoundary', () => {
  it('shows a fallback instead of a blank page and can retry', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { user } = renderWithProviders(
      <ErrorBoundary>
        <Fragile />
      </ErrorBoundary>,
    );

    expect(screen.getByText('This page failed to load')).toBeInTheDocument();
    shouldThrow = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByText('Recovered content')).toBeInTheDocument();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
