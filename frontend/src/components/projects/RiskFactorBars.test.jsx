import { screen, within } from '@testing-library/react';
import { BarChart } from '@mui/x-charts/BarChart';
import RiskFactorBars from './RiskFactorBars.jsx';
import { ALPHA_RISK } from './testFixtures.js';
import { renderWithProviders } from '../../test/utils.jsx';

// jsdom has no layout, so the chart's SVG has no size here: check what the chart is given.
vi.mock('@mui/x-charts/BarChart', () => ({ BarChart: vi.fn(() => null) }));

const chartProps = () => vi.mocked(BarChart).mock.calls.at(-1)[0];

/**
 * Bar labels the chart would print for one series, by factor.
 * @param {object} series - Series passed to BarChart.
 * @returns {Array<string|null>} Label per data index.
 */
function labelsOf(series) {
  return series.data.map((value, dataIndex) => series.barLabel({ seriesId: series.id, dataIndex, value }, {}));
}

/**
 * Stand-in ResizeObserver reporting one fixed width as soon as an element is observed.
 * @param {number} width - Content width to report, in pixels.
 * @returns {Function} Class to install as the global ResizeObserver.
 */
function resizeObserverReporting(width) {
  return class FixedWidthObserver {
    constructor(callback) {
      this.callback = callback;
    }

    observe() {
      this.callback([{ contentRect: { width } }]);
    }

    disconnect() {}
  };
}

beforeEach(() => vi.mocked(BarChart).mockClear());
afterEach(() => vi.unstubAllGlobals());

describe('RiskFactorBars', () => {
  it('draws the factors as one horizontal @mui/x-charts bar chart, one band per factor', () => {
    renderWithProviders(<RiskFactorBars factors={ALPHA_RISK.factors} />);

    expect(BarChart).toHaveBeenCalled();
    const props = chartProps();
    expect(props.layout).toBe('horizontal');
    expect(props.yAxis[0]).toMatchObject({
      scaleType: 'band',
      data: [
        'Schedule',
        'Blocked deliverables',
        'Dependency blast radius',
        'Resource over-allocation',
        'Budget vs progress',
        'Deadline proximity',
      ],
    });
    expect(props.xAxis[0].min).toBe(0);
    expect(props.xAxis[0].max).toBeGreaterThan(20);
  });

  it('fills each bar to its points on a track as long as the maximum, printing "points / max" after it', () => {
    renderWithProviders(<RiskFactorBars factors={ALPHA_RISK.factors} />);

    const [points, headroom] = chartProps().series;
    expect(points).toMatchObject({ id: 'points', stack: 'factor', data: [16, 10, 15, 12, 15, 10] });
    expect(headroom).toMatchObject({ id: 'headroom', stack: 'factor', data: [4, 5, 5, 3, 5, 0] });
    expect(points.data.reduce((sum, value) => sum + value, 0)).toBe(ALPHA_RISK.risk_score);
    // The label goes on whichever segment ends at the maximum: the track, or the fill when capped.
    expect(labelsOf(headroom)).toEqual(['16 / 20', '10 / 15', '15 / 20', '12 / 15', '15 / 20', null]);
    expect(labelsOf(points)).toEqual([null, null, null, null, null, '10 / 10']);
    expect(headroom.barLabelPlacement).toBe('outside');
    expect(points.barLabelPlacement).toBe('outside');
    // Fill colour rises with the share of the maximum: capped factors use the error colour.
    const colours = points.data.map((_, dataIndex) => points.colorGetter({ dataIndex, value: points.data[dataIndex] }));
    expect(colours[5]).not.toBe(colours[0]);
    expect(new Set(colours.slice(0, 5)).size).toBe(1);
  });

  it('works out the axis from the chart width so "points / max" fits after the longest bar', () => {
    // 312px wide (a 390px phone): 168px of names and a 4px margin leave a 140px plot; the
    // 20-point bars may take 140 - 58 = 82px, leaving 58px for their label.
    vi.stubGlobal('ResizeObserver', resizeObserverReporting(312));
    renderWithProviders(<RiskFactorBars factors={ALPHA_RISK.factors} />);
    expect(chartProps().xAxis[0].max).toBeCloseTo((20 * 140) / 82, 6);

    // Too narrow to share the plot: give labels two thirds of it.
    vi.stubGlobal('ResizeObserver', resizeObserverReporting(259));
    renderWithProviders(<RiskFactorBars factors={ALPHA_RISK.factors} />);
    expect(chartProps().xAxis[0].max).toBe(60);
  });

  it('names the chart with every value and lists each factor with its detail', () => {
    renderWithProviders(<RiskFactorBars factors={ALPHA_RISK.factors} ariaLabel="Alpha risk factors" />);

    expect(screen.getByRole('figure')).toHaveAccessibleName(
      'Alpha risk factors: Schedule 16 of 20 points; Blocked deliverables 10 of 15 points; Dependency blast radius 15 of 20 points; ' +
        'Resource over-allocation 12 of 15 points; Budget vs progress 15 of 20 points; Deadline proximity 10 of 10 points.',
    );
    const deadline = screen.getByTestId('risk-factor-deadline');
    expect(within(deadline).getByRole('term')).toHaveTextContent('Deadline proximity:');
    expect(within(deadline).getByRole('definition')).toHaveTextContent('25 days left at 35.0% complete');
  });

  it('falls back to the points when a factor has no detail, and says so when there are no factors', () => {
    const { rerender } = renderWithProviders(
      <RiskFactorBars factors={[{ key: 'schedule', label: 'Schedule', points: 0, max_points: 20 }]} />,
    );
    expect(within(screen.getByTestId('risk-factor-schedule')).getByRole('definition')).toHaveTextContent('0 / 20 points');

    rerender(<RiskFactorBars factors={[]} />);
    expect(screen.getByText('No risk factors were returned.')).toBeInTheDocument();
    expect(screen.queryByRole('figure')).not.toBeInTheDocument();
  });
});
