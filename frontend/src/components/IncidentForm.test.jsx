import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FACILITIES, mockApi } from '../test/mockApi';
import IncidentForm from './IncidentForm';

const field = (name) => screen.getByLabelText(new RegExp(`^${name}`));

async function renderForm(props = {}) {
  mockApi({ 'GET /facilities': FACILITIES });
  const onSubmit = props.onSubmit ?? vi.fn();
  render(<IncidentForm submitLabel="Submit incident" onSubmit={onSubmit} {...props} />);
  await waitFor(() => expect(field('Building')).toBeEnabled());
  return onSubmit;
}

describe('IncidentForm', () => {
  it('requires title, description, category and building', async () => {
    const user = userEvent.setup();
    const onSubmit = await renderForm();
    await user.type(field('Title'), '   ');
    await user.click(screen.getByRole('button', { name: 'Submit incident' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Please fill in the title, description, category and building.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('cascades building -> floor -> seat and submits numeric ids', async () => {
    const user = userEvent.setup();
    const onSubmit = await renderForm();

    expect(field('Floor')).toBeDisabled();
    await user.type(field('Title'), '  Leaking tap ');
    await user.type(field('Description'), 'Dripping all day');
    await user.selectOptions(field('Category'), 'plumbing');
    await user.selectOptions(field('Building'), 'ACME Headquarters');
    expect(field('Seat')).toBeDisabled();
    await user.selectOptions(field('Floor'), 'First Floor');
    await user.selectOptions(field('Seat'), '1A-001 – Window');
    await user.selectOptions(field('Priority'), 'High');
    await user.click(screen.getByRole('button', { name: 'Submit incident' }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Leaking tap', description: 'Dripping all day', category: 'plumbing', priority: 'high',
      building_id: 1, floor_id: 10, seat_id: 100, location_details: null,
    });
  });

  it('clears floor and seat when the building changes', async () => {
    const user = userEvent.setup();
    await renderForm();
    await user.selectOptions(field('Building'), 'ACME Headquarters');
    expect(screen.getByRole('option', { name: 'Floor 2' })).toBeInTheDocument(); // unnamed floor
    await user.selectOptions(field('Floor'), 'First Floor');
    await user.selectOptions(field('Seat'), '1A-001 – Window');
    await user.selectOptions(field('Building'), 'Innovation Hub');
    expect(field('Floor')).toHaveValue('');
    expect(field('Seat')).toHaveValue('');
    expect(field('Seat')).toBeDisabled();
  });

  it('only offers critical priority to admins', async () => {
    await renderForm();
    expect(screen.queryByRole('option', { name: 'Critical' })).not.toBeInTheDocument();
  });

  it('offers critical priority when allowed', async () => {
    await renderForm({ allowCritical: true });
    expect(screen.getByRole('option', { name: 'Critical' })).toBeInTheDocument();
  });

  it('pre-fills for editing and can hide priority', async () => {
    await renderForm({ initial: { title: 'Old title', description: 'D', category: 'hvac', building_id: 1, floor_id: null }, showPriority: false });
    expect(field('Title')).toHaveValue('Old title');
    expect(field('Category')).toHaveValue('hvac');
    expect(screen.queryByLabelText(/^Priority/)).not.toBeInTheDocument();
  });

  it('shows server errors and lets the user retry', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error('That floor is not in the selected building.'));
    await renderForm({ onSubmit, initial: { title: 'T', description: 'D', category: 'hvac', building_id: 1 } });
    await user.click(screen.getByRole('button', { name: 'Submit incident' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That floor is not in the selected building.');
    expect(screen.getByRole('button', { name: 'Submit incident' })).toBeEnabled();
  });

  it('reports when facilities cannot load', async () => {
    mockApi({ 'GET /facilities': { status: 500, body: { message: 'Something went wrong. Please try again.' } } });
    render(<IncidentForm onSubmit={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });
});
