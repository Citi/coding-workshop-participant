import {
  changedFields,
  entityLabel,
  fieldLabel,
  formatStateValue,
  isFieldChanged,
  isMoneyField,
  recordName,
  stateFields,
  summarizeChange,
} from './auditUtils.js';
import { DIVERGENCE_RISK_THRESHOLD, divergenceOf, divergenceWords, formatPoints, shortProjectName } from './budgetUtils.js';
import { allocationTarget, formatShortWindow, formatWindow, loadTone } from './capacityUtils.js';
import { isBlank, isDateRangeValid, parseId, parseIntegerInRange } from './formUtils.js';
import { withSelectedOption } from './selectOptions.js';

describe('budgetUtils', () => {
  it('reads a divergence in words around the 10-point risk threshold', () => {
    expect(DIVERGENCE_RISK_THRESHOLD).toBe(10);
    expect(divergenceWords(40)).toBe('Spending well ahead of progress');
    expect(divergenceWords(10)).toBe('Spending slightly ahead of progress');
    expect(divergenceWords(0.1)).toBe('Spending slightly ahead of progress');
    expect(divergenceWords(0)).toBe('Spending in line with progress');
    expect(divergenceWords(-5)).toBe('Progress ahead of spending');
    expect(divergenceWords(null)).toBe('No planned budget to compare against');
  });

  it('formats signed points and computes divergence like the API', () => {
    expect(formatPoints(40)).toBe('+40.0 pts');
    expect(formatPoints(-5)).toBe('−5.0 pts');
    expect(formatPoints(0)).toBe('0.0 pts');
    expect(formatPoints(undefined)).toBe('—');
    expect(divergenceOf(76.7, 35)).toBe(41.7);
    expect(divergenceOf(55, 60)).toBe(-5);
    expect(divergenceOf(null, 60)).toBeNull();
  });

  it('shortens project names for chart labels', () => {
    expect(shortProjectName('Project Alpha: Customer Payments Platform')).toBe('Project Alpha');
    expect(shortProjectName('Website')).toBe('Website');
    expect(shortProjectName(': odd')).toBe(': odd');
    expect(shortProjectName(null)).toBe('');
  });
});

describe('capacityUtils', () => {
  it('colours load above, at and below 100%', () => {
    expect(loadTone(120)).toBe('error');
    expect(loadTone(100)).toBe('warning');
    expect(loadTone(60)).toBe('primary');
    expect(loadTone(null)).toBe('primary');
  });

  it('describes windows and allocation targets', () => {
    expect(formatWindow('2026-11-22', '2026-12-06')).toBe('Nov 22, 2026 to Dec 6, 2026');
    expect(formatWindow('2026-11-22', '2026-11-22')).toBe('Nov 22, 2026');
    expect(allocationTarget({ deliverable_title: 'API Schema' })).toBe('API Schema');
    expect(allocationTarget({ deliverable_title: null })).toBe('Project level');
  });

  it('writes compact windows for table cells, with the year once when shared', () => {
    expect(formatShortWindow('2026-11-22', '2026-12-06')).toBe('Nov 22\u00a0– Dec 6, 2026');
    expect(formatShortWindow('2026-12-28', '2027-01-03')).toBe('Dec 28, 2026\u00a0– Jan 3, 2027');
    expect(formatShortWindow('2026-11-22', '2026-11-22')).toBe('Nov 22, 2026');
    expect(formatShortWindow(null, '2026-12-06')).toBe('— to Dec 6, 2026');
  });
});

describe('formUtils', () => {
  it('parses whole numbers in range and ids', () => {
    expect(parseIntegerInRange(' 42 ', 1, 100)).toBe(42);
    expect(parseIntegerInRange('0', 1, 100)).toBeNull();
    expect(parseIntegerInRange('101', 1, 100)).toBeNull();
    expect(parseIntegerInRange('4.5', 1, 100)).toBeNull();
    expect(parseIntegerInRange('', 0, 100)).toBeNull();
    expect(parseIntegerInRange('-3', -5, 5)).toBe(-3);
    expect(parseId('7')).toBe(7);
    expect(parseId('0')).toBeNull();
    expect(parseId('abc')).toBeNull();
    expect(parseId(null)).toBeNull();
    expect(parseId('99999999999999999999')).toBeNull();
  });

  it('checks blanks and date order', () => {
    expect(isBlank('  ')).toBe(true);
    expect(isBlank(null)).toBe(true);
    expect(isBlank('x')).toBe(false);
    expect(isDateRangeValid('2026-11-01', '2026-11-30')).toBe(true);
    expect(isDateRangeValid('2026-11-30', '2026-11-30')).toBe(true);
    expect(isDateRangeValid('2026-12-01', '2026-11-30')).toBe(false);
    expect(isDateRangeValid('', '2026-11-30')).toBe(true);
  });
});

describe('selectOptions', () => {
  it('keeps a selected value that has not loaded yet', () => {
    const options = [{ value: '1', label: 'Alpha' }];
    expect(withSelectedOption(options, '1', (value) => `#${value}`)).toBe(options);
    expect(withSelectedOption(options, '', (value) => `#${value}`)).toBe(options);
    expect(withSelectedOption(options, '9', (value) => `#${value}`)).toEqual([...options, { value: '9', label: '#9' }]);
  });
});

describe('auditUtils', () => {
  const before = { id: 2, title: 'API Schema', status: 'BLOCKED', meta: { a: 1 }, updated_at: 't1' };
  const after = { id: 2, title: 'API Schema', status: 'DONE', meta: { a: 2 }, updated_at: 't2', note: 'new' };

  it('lists fields with id first and finds the changed ones', () => {
    expect(stateFields({ b: 1, id: 3 }, null)).toEqual(['id', 'b']);
    expect(changedFields(before, after)).toEqual(['status', 'meta', 'note']);
    expect(changedFields(before, after, { includeBookkeeping: true })).toContain('updated_at');
    expect(changedFields(null, after)).toEqual([]);
    expect(isFieldChanged(before, after, 'status')).toBe(true);
    expect(isFieldChanged(before, after, 'title')).toBe(false);
    expect(isFieldChanged(null, after, 'status')).toBe(false);
  });

  it('formats values and labels', () => {
    expect(formatStateValue(null)).toBe('—');
    expect(formatStateValue('')).toBe('—');
    expect(formatStateValue({ a: 1 })).toBe('{"a":1}');
    expect(formatStateValue(40)).toBe('40');
    expect(formatStateValue(false)).toBe('false');
    expect(fieldLabel('completion_percentage')).toBe('Completion percentage');
  });

  it('names the record and its type from the states', () => {
    expect(recordName({ entity_type: 'project', after_state: { project_name: 'Alpha' }, before_state: null })).toBe('Alpha');
    expect(recordName({ entity_type: 'user', after_state: null, before_state: { email: 'a@b.co' } })).toBe('a@b.co');
    expect(
      recordName({
        entity_type: 'dependency',
        after_state: { predecessor_deliverable_id: 1, successor_deliverable_id: 2 },
        before_state: null,
      }),
    ).toBe('Deliverable #1 → #2');
    expect(
      recordName({
        entity_type: 'allocation',
        after_state: { user_id: 5, project_id: 1, allocation_percentage: 60 },
        before_state: null,
      }),
    ).toBe('User #5, 60% on project #1');
    expect(
      recordName({ entity_type: 'budget_entry', after_state: { category: 'LABOR', amount: '1500.00' }, before_state: null }),
    ).toBe('Labor $1,500.00');
    expect(isMoneyField('amount')).toBe(true);
    expect(isMoneyField('planned_budget')).toBe(true);
    expect(isMoneyField('allocation_percentage')).toBe(false);
    expect(recordName({ entity_type: 'thing', after_state: null, before_state: null })).toBe('');
    expect(entityLabel({ entity_type: 'budget_entry', entity_id: 4 })).toBe('Budget entry #4');
    expect(entityLabel({ entity_type: 'new_kind', entity_id: null })).toBe('New kind');
  });

  it('summarises a change in one line', () => {
    expect(summarizeChange({ action: 'CREATE' })).toBe('Created this record');
    expect(summarizeChange({ action: 'DELETE' })).toBe('Deleted this record');
    expect(summarizeChange({ action: 'UPDATE', before_state: before, after_state: after })).toBe(
      'Changed status, meta and note',
    );
    expect(
      summarizeChange({ action: 'UPDATE', before_state: { status: 'A' }, after_state: { status: 'B' } }),
    ).toBe('Changed status');
    expect(
      summarizeChange({ action: 'UPDATE', before_state: { updated_at: 1 }, after_state: { updated_at: 2 } }),
    ).toBe('Saved without changing any value');
  });
});
