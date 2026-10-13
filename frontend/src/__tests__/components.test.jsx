import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import CapacityBar from '../components/CapacityBar';
import StatusChip from '../components/StatusChip';
import MilestoneTimeline from '../components/MilestoneTimeline';
import { EmptyState, ErrorState } from '../components/StateViews';

describe('CapacityBar', () => {
  it('describes hours against plan for screen readers', () => {
    render(<CapacityBar logged={40} planned={160} />);
    expect(screen.getByRole('meter')).toHaveAccessibleName('40 h logged of 160 h planned (25%)');
  });

  it('flags going over plan', () => {
    render(<CapacityBar logged={200} planned={160} />);
    expect(screen.getByText(/Over plan/)).toBeInTheDocument();
  });

  it('handles projects with no capacity yet', () => {
    render(<CapacityBar logged={0} planned={0} />);
    expect(screen.getByRole('meter')).toHaveAccessibleName(/no capacity planned yet/);
  });
});

describe('StatusChip', () => {
  it('shows human labels and overdue state', () => {
    const { rerender } = render(<StatusChip status="on_hold" />);
    expect(screen.getByText('On hold')).toBeInTheDocument();
    rerender(<StatusChip status="in_progress" kind="milestone" />);
    expect(screen.getByText('In progress')).toBeInTheDocument();
    rerender(<StatusChip status="active" overdue />);
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });
});

describe('MilestoneTimeline', () => {
  it('renders one accessible row per milestone', () => {
    render(
      <MilestoneTimeline
        start="2026-01-01"
        end="2026-03-31"
        milestones={[
          { id: 1, name: 'Design', start_date: '2026-01-01', end_date: '2026-01-31', status: 'completed' },
          { id: 2, name: 'Build', start_date: '2026-02-01', end_date: '2026-04-15', status: 'in_progress', is_overdue: true },
        ]}
      />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByLabelText(/Build: Feb 1 to Apr 15, In progress, overdue/)).toBeInTheDocument();
  });
});

describe('State views', () => {
  it('shows errors and empty states', () => {
    render(<><ErrorState error={{ message: 'Boom' }} /><EmptyState title="Nothing here">Add one</EmptyState></>);
    expect(screen.getByText('Boom')).toBeInTheDocument();
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });
});
