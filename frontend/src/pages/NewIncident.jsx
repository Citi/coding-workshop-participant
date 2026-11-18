import { Section } from '../components/Badges';
import IncidentForm from '../components/IncidentForm';
import { navigate } from '../router';
import { createIncident } from '../services/incidentService';

export default function NewIncident({ user }) {
  const handleSubmit = async (payload) => {
    const created = await createIncident(payload);
    navigate(`/incidents/${created.id}`);
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <a href="#/incidents" className="back-link">← Incidents</a>
          <h1>Report an incident</h1>
          <p className="muted">
            Tell us what's wrong and where. A Facility Admin will assign an engineer.
          </p>
        </div>
      </div>
      <Section>
        <IncidentForm
          submitLabel="Submit incident"
          allowCritical={user.role === 'facility_admin'}
          onSubmit={handleSubmit}
          onCancel={() => window.history.back()}
        />
      </Section>
    </>
  );
}
