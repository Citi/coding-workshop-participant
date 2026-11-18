export const ROLE_LABELS = {
  employee: 'Employee',
  engineer: 'Engineer',
  facility_admin: 'Facility Admin',
};

export const STATUS_LABELS = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In progress',
  on_hold: 'On hold',
  resolved: 'Resolved',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

export const PRIORITIES = ['low', 'medium', 'high', 'critical'];

export const CATEGORIES = [
  'electrical', 'plumbing', 'hvac', 'furniture', 'cleaning', 'security',
  'it_hardware', 'network', 'audio_visual', 'other',
];

const CATEGORY_LABELS = { hvac: 'HVAC', it_hardware: 'IT hardware', audio_visual: 'Audio / visual' };

export const AVAILABILITY_LABELS = {
  available: 'Available',
  busy: 'Busy',
  on_leave: 'On leave',
  offline: 'Offline',
};

export const titleCase = (s) =>
  s ? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '';

export const categoryLabel = (c) => CATEGORY_LABELS[c] ?? titleCase(c);

export const sumCounts = (counts, statuses) =>
  statuses.reduce((n, s) => n + (counts?.[s] ?? 0), 0);

export function timeAgo(iso) {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60]]) {
    if (seconds >= size) {
      const n = Math.floor(seconds / size);
      return `${n} ${unit}${n > 1 ? 's' : ''} ago`;
    }
  }
  return '';
}

export const formatDateTime = (iso) => (iso ? new Date(iso).toLocaleString() : '–');

export function locationText(i) {
  return [i.building, i.floor, i.seat ? `Seat ${i.seat}` : null, i.location_details]
    .filter(Boolean)
    .join(' · ');
}
