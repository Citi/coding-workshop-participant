import { STATUS_LABELS, titleCase } from '../utils/format';

export function StatusBadge({ status }) {
  return <span className={`badge status-${status}`}>{STATUS_LABELS[status] ?? status}</span>;
}

export function PriorityBadge({ priority, requested }) {
  return (
    <span className="priority-cell">
      <span className={`badge priority-${priority}`}>{titleCase(priority)}</span>
      {requested && requested !== priority && (
        <span className="requested" title="Priority requested by employee">
          → {titleCase(requested)} requested
        </span>
      )}
    </span>
  );
}

export function StatCard({ label, value, tone = 'neutral', hint }) {
  return (
    <div className={`stat-card tone-${tone}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

export function Section({ title, children, aside }) {
  return (
    <section className="panel">
      {(title || aside) && (
        <header className="panel-header">
          {title && <h2>{title}</h2>}
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}
