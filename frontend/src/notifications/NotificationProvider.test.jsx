import { act, render, screen, waitFor } from '@testing-library/react';
import Button from '@mui/material/Button';
import NotificationProvider, { MIN_VISIBLE_MS } from './NotificationProvider.jsx';
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

// Two messages from one event handler land in one render batch. The queue used to close the
// first message before it ever rendered open; MUI then never fired onExited and every later
// message stayed queued for the rest of the session.
function Burst() {
  const notify = useNotify();
  return (
    <>
      <button
        type="button"
        onClick={() => {
          notify.success('Allocation saved.');
          notify.warning('Priya Nair is at 120%.');
        }}
      >
        save-and-warn
      </button>
      <button type="button" onClick={() => notify.error('Later failure.')}>
        later
      </button>
    </>
  );
}

describe('NotificationProvider queue timing', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Step through time in small slices so React commits between the timers of each
  // transition stage (early close, exit animation, next message).
  function advance(ms, step = 50) {
    for (let elapsed = 0; elapsed < ms; elapsed += step) {
      act(() => {
        vi.advanceTimersByTime(Math.min(step, ms - elapsed));
      });
    }
  }

  function click(name) {
    act(() => {
      screen.getByRole('button', { name }).click();
    });
  }

  it('shows both messages sent from one handler, then later ones too', () => {
    render(
      <NotificationProvider>
        <Burst />
      </NotificationProvider>,
    );

    click('save-and-warn');
    expect(screen.getByRole('alert')).toHaveTextContent('Allocation saved.');

    // The first message stays readable instead of being replaced at once ...
    advance(MIN_VISIBLE_MS - 100);
    expect(screen.getByRole('alert')).toHaveTextContent('Allocation saved.');

    // ... then closes early, and the queued warning takes its place.
    advance(600);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Priya Nair is at 120%.');
    expect(screen.getByRole('alert')).toHaveClass('MuiAlert-colorWarning');

    // The warning hides on its own (7 s) and the snackbar goes idle ...
    advance(8000);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // ... and a later message still shows: the queue never gets stuck.
    click('later');
    expect(screen.getByRole('alert')).toHaveTextContent('Later failure.');
  });

  it('queues a message sent while the second of a pair is showing', () => {
    render(
      <NotificationProvider>
        <Burst />
      </NotificationProvider>,
    );

    click('save-and-warn');
    advance(MIN_VISIBLE_MS + 300);
    expect(screen.getByRole('alert')).toHaveTextContent('Priya Nair is at 120%.');

    click('later');
    advance(MIN_VISIBLE_MS - 200);
    expect(screen.getByRole('alert')).toHaveTextContent('Priya Nair is at 120%.');
    advance(500);
    expect(screen.getByRole('alert')).toHaveTextContent('Later failure.');
  });

  it('replaces a message that has already been readable without waiting', () => {
    render(
      <NotificationProvider>
        <Burst />
      </NotificationProvider>,
    );

    click('later');
    advance(MIN_VISIBLE_MS + 1000);
    expect(screen.getByRole('alert')).toHaveTextContent('Later failure.');

    click('save-and-warn');
    advance(300);
    expect(screen.getByRole('alert')).toHaveTextContent('Allocation saved.');
  });

  it('moves straight to the queued message when the current one is dismissed', () => {
    render(
      <NotificationProvider>
        <Burst />
      </NotificationProvider>,
    );

    click('save-and-warn');
    click('Close');
    advance(300);
    expect(screen.getByRole('alert')).toHaveTextContent('Priya Nair is at 120%.');
  });

  it('replaces at once with minVisibleMs 0 and still recovers for later messages', () => {
    render(
      <NotificationProvider minVisibleMs={0}>
        <Burst />
      </NotificationProvider>,
    );

    click('save-and-warn');
    advance(300);
    expect(screen.getByRole('alert')).toHaveTextContent('Priya Nair is at 120%.');

    click('later');
    advance(300);
    expect(screen.getByRole('alert')).toHaveTextContent('Later failure.');
    advance(9000);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
