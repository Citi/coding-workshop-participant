import { categoryLabel, locationText, timeAgo } from '../utils/format';
import { PriorityBadge, StatusBadge } from './Badges';

export default function IncidentTable({ incidents, columns = [], empty }) {
  if (!incidents?.length) {
    return <p className="empty">{empty}</p>;
  }
  return (
    <div className="table-wrap">
      <table className="incident-table">
        <thead>
          <tr>
            <th>Incident</th>
            <th>Status</th>
            <th>Priority</th>
            {columns.includes('reporter') && <th>Reported by</th>}
            {columns.includes('engineer') && <th>Engineer</th>}
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {incidents.map((i) => (
            <tr key={i.id}>
              <td>
                <div className="incident-title">
                  <span className="ref">{i.reference}</span>
                  <a href={`#/incidents/${i.id}`}>{i.title}</a>
                  {i.is_escalated && <span className="badge escalated">Escalated</span>}
                </div>
                <div className="incident-meta">
                  {categoryLabel(i.category)} · {locationText(i)}
                </div>
              </td>
              <td><StatusBadge status={i.status} /></td>
              <td><PriorityBadge priority={i.priority} requested={i.requested_priority} /></td>
              {columns.includes('reporter') && <td>{i.reported_by}</td>}
              {columns.includes('engineer') && (
                <td>{i.assigned_engineer ?? <span className="muted">Unassigned</span>}</td>
              )}
              <td className="muted nowrap" title={new Date(i.updated_at).toLocaleString()}>
                {timeAgo(i.updated_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
