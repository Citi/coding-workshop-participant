import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockApi } from '../test/mockApi';
import NotificationBell from './NotificationBell';

const ITEMS = [
  { id: 2, kind: 'note_added', message: 'Ethan Electrics added a note on INC-000004: "Part arrives Monday"', incident_id: 4,
    incident_ref: 'INC-000004', actor_name: 'Ethan Electrics', is_read: false, created_at: new Date().toISOString() },
  { id: 1, kind: 'incident_deleted', message: 'Alice Admin deleted INC-000005: Leaking tap', incident_id: null,
    incident_ref: 'INC-000005', actor_name: 'Alice Admin', is_read: true, created_at: '2026-11-10T09:00:00Z' },
];

describe('NotificationBell', () => {
  it('shows the unread count and lists notifications', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /notifications/unread-count': { unread_count: 1 },
      'GET /notifications': { items: ITEMS, unread_count: 1 },
    });
    render(<NotificationBell path="/" />);

    const bell = await screen.findByRole('button', { name: 'Notifications, 1 unread' });
    await user.click(bell);
    const panel = await screen.findByRole('dialog', { name: 'Notifications' });
    expect(panel).toHaveTextContent('Part arrives Monday');
    expect(screen.getByLabelText('Unread')).toBeInTheDocument();
    // a read notification about a deleted incident has nowhere to go
    expect(screen.getByRole('button', { name: /deleted INC-000005/ })).toBeDisabled();
  });

  it('opening a notification marks it read and goes to the incident', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      'GET /notifications/unread-count': { unread_count: 1 },
      'GET /notifications': { items: ITEMS, unread_count: 1 },
      'POST /notifications/2/read': { unread_count: 0 },
    });
    render(<NotificationBell path="/" />);
    await user.click(await screen.findByRole('button', { name: /Notifications/ }));
    await user.click(await screen.findByRole('button', { name: /Part arrives Monday/ }));

    expect(window.location.hash).toBe('#/incidents/4');
    expect(api.calls.some((c) => c.method === 'POST' && c.path === '/notifications/2/read')).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('marks everything read', async () => {
    const user = userEvent.setup();
    let items = ITEMS;
    const unreadCount = () => items.filter((n) => !n.is_read).length;
    mockApi({
      'GET /notifications/unread-count': () => ({ unread_count: unreadCount() }),
      'GET /notifications': () => ({ items, unread_count: unreadCount() }),
      'POST /notifications/read-all': () => {
        items = items.map((n) => ({ ...n, is_read: true }));
        return { unread_count: 0 };
      },
    });
    render(<NotificationBell path="/" />);
    await user.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
    await user.click(await screen.findByRole('button', { name: 'Mark all as read' }));

    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Unread')).not.toBeInTheDocument();
  });

  it('shows an empty state and closes with Escape', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /notifications/unread-count': { unread_count: 0 },
      'GET /notifications': { items: [], unread_count: 0 },
    });
    render(<NotificationBell path="/" />);
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(await screen.findByText(/You're all caught up/)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('polls for new notifications every 30 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let count = 0;
    mockApi({ 'GET /notifications/unread-count': () => ({ unread_count: count }) });
    render(<NotificationBell path="/" />);
    expect(await screen.findByRole('button', { name: 'Notifications' })).toBeInTheDocument();

    count = 3;
    await act(() => vi.advanceTimersByTimeAsync(30000));
    expect(await screen.findByRole('button', { name: 'Notifications, 3 unread' })).toBeInTheDocument();
    vi.useRealTimers();
  });
});
