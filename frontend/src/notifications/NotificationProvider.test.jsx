import { act, render, screen, waitFor } from '@testing-library/react';
import Button from '@mui/material/Button';
import { useNotify } from './useNotify.js';
import { ApiError } from '../services/apiClient.js';
import { renderWithProviders } from '../test/utils.jsx';

function Trigger() {
  const notify = useNotify();
  return (
    <>
      <Button onClick={() => notify.success('Project saved.')}>save</Button>
      <Button onClick={() => notify.error(new ApiError({ status: 409, error: 'CONFLICT', message: 'Name already used.' }))}>
        fail
      </Button>
      <Button onClick={() => notify.error(null)}>fail-unknown</Button>
      <Button onClick={() => notify.warning('Over-allocated.')}>warn</Button>
      <Button onClick={() => notify.info('Heads up.')}>info</Button>
    </>
  );
}

describe('NotificationProvider', () => {
  it('shows success and error messages, one after the other', async () => {
    const { user } = renderWithProviders(<Trigger />);

    await user.click(screen.getByRole('button', { name: 'save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Project saved.');

    await user.click(screen.getByRole('button', { name: 'fail' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Name already used.'));
    expect(screen.getByRole('alert')).toHaveClass('MuiAlert-colorError');
  });

  it('uses a fallback message for unknown errors and can be dismissed', async () => {
    const { user } = renderWithProviders(<Trigger />);

    await user.click(screen.getByRole('button', { name: 'fail-unknown' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('queues messages sent while one is showing', async () => {
    const { user } = renderWithProviders(<Trigger />);

    await user.click(screen.getByRole('button', { name: 'warn' }));
    await act(async () => {
      screen.getByRole('button', { name: 'info' }).click();
    });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Heads up.'));
  });

  it('throws outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Trigger />)).toThrow('useNotify must be used inside <NotificationProvider>.');
    spy.mockRestore();
  });
});
