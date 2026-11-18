import { useCallback, useEffect, useRef, useState } from 'react';
import { navigate } from '../router';
import {
  NOTIFICATIONS_CHANGED, getUnreadCount, listNotifications, markAllRead, markRead,
} from '../services/notificationService';
import { formatDateTime, timeAgo } from '../utils/format';

const POLL_MS = 30000;

export default function NotificationBell({ path }) {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const rootRef = useRef(null);

  const refreshCount = useCallback(() => {
    getUnreadCount()
      .then((r) => setCount(r.unread_count))
      .catch(() => {});
  }, []);

  const loadList = useCallback(() => {
    setError('');
    listNotifications()
      .then((r) => {
        setItems(r.items);
        setCount(r.unread_count);
      })
      .catch((err) => setError(err.message));
  }, []);

  // Poll while the tab is visible; refresh on navigation and on local changes
  useEffect(() => {
    refreshCount();
    const tick = () => document.visibilityState === 'visible' && refreshCount();
    const id = setInterval(tick, POLL_MS);
    const onChanged = () => (open ? loadList() : refreshCount());
    window.addEventListener(NOTIFICATIONS_CHANGED, onChanged);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      window.removeEventListener(NOTIFICATIONS_CHANGED, onChanged);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [refreshCount, loadList, open]);

  useEffect(() => {
    refreshCount();
    setOpen(false);
  }, [path, refreshCount]);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => rootRef.current && !rootRef.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) loadList();
  };

  const openItem = async (n) => {
    if (!n.is_read) {
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      markRead(n.id).catch(() => {});
    }
    setOpen(false);
    if (n.incident_id) navigate(`/incidents/${n.incident_id}`);
  };

  const readAll = async () => {
    await markAllRead().catch(() => {});
    setItems((list) => list?.map((x) => ({ ...x, is_read: true })));
    setCount(0);
  };

  const label = count ? `Notifications, ${count} unread` : 'Notifications';

  return (
    <div className="bell" ref={rootRef}>
      <button
        type="button"
        className={`bell-button ${open ? 'open' : ''}`}
        onClick={toggle}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="true"
        title={label}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            d="M12 3a6 6 0 0 0-6 6v3.6L4.3 15.4A1 1 0 0 0 5.2 17h13.6a1 1 0 0 0 .9-1.6L18 12.6V9a6 6 0 0 0-6-6Zm-2.5 15.5a2.5 2.5 0 0 0 5 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {count > 0 && <span className="bell-count">{count > 99 ? '99+' : count}</span>}
      </button>

      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <strong>Notifications</strong>
            <button type="button" className="btn-link" onClick={readAll} disabled={!count}>
              Mark all as read
            </button>
          </div>
          {error && <p className="bell-empty">{error}</p>}
          {!error && items === null && <p className="bell-empty">Loading…</p>}
          {!error && items?.length === 0 && (
            <p className="bell-empty">You're all caught up. Updates about your incidents will appear here.</p>
          )}
          {items?.length > 0 && (
            <ul className="bell-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`bell-item ${n.is_read ? '' : 'unread'}`}
                    onClick={() => openItem(n)}
                    disabled={!n.incident_id && n.is_read}
                  >
                    {!n.is_read && <span className="unread-dot" aria-label="Unread" />}
                    <span className="bell-text">
                      <span className="bell-message">{n.message}</span>
                      <span className="bell-time" title={formatDateTime(n.created_at)}>{timeAgo(n.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
