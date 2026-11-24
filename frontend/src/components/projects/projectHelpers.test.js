import {
  budgetEntryChanges,
  budgetEntryPayload,
  deliverableChanges,
  deliverablePayload,
  deliverableToValues,
  emptyDeliverableValues,
  emptyProjectValues,
  projectChanges,
  projectPayload,
  projectToValues,
  validateBudgetEntry,
  validateDeliverable,
  validateDependency,
  validateProject,
} from './entityForms.js';
import {
  changedFields,
  currencySymbol,
  dateError,
  idOrNull,
  isIsoDate,
  moneyError,
  percentError,
  toMoneyString,
} from './formUtils.js';
import {
  DEFAULT_PROJECT_TAB,
  depthLabel,
  describeAuditEntry,
  describeDivergence,
  divergencePoints,
  factorChartRows,
  factorTone,
  isRecordId,
  normaliseTab,
  projectPath,
  roundOneDecimal,
} from './projectUtils.js';
import { ALPHA, ALPHA_BUDGET_ENTRIES, ALPHA_DELIVERABLES, ALPHA_RISK } from './testFixtures.js';

describe('project tabs and links', () => {
  it('accepts the five tab names and falls back to overview', () => {
    ['overview', 'deliverables', 'dependencies', 'budget', 'risk'].forEach((tab) => expect(normaliseTab(tab)).toBe(tab));
    expect(normaliseTab('RISK')).toBe('risk');
    expect(normaliseTab('gantt')).toBe(DEFAULT_PROJECT_TAB);
    expect(normaliseTab(null)).toBe('overview');
  });

  it('builds detail links, leaving out the default tab', () => {
    expect(projectPath(1)).toBe('/projects/1');
    expect(projectPath(1, 'overview')).toBe('/projects/1');
    expect(projectPath(4, 'risk')).toBe('/projects/4?tab=risk');
    expect(projectPath('7', 'nope')).toBe('/projects/7');
  });

  it('recognises record ids', () => {
    expect(isRecordId('42')).toBe(true);
    expect(isRecordId('0')).toBe(false);
    expect(isRecordId('abc')).toBe(false);
    expect(isRecordId('1e3')).toBe(false);
    expect(isRecordId(undefined)).toBe(false);
  });
});

describe('budget versus progress wording', () => {
  it('says how far spending runs ahead of delivery (spec 12.4 example)', () => {
    expect(describeDivergence(75, 35)).toEqual({
      severity: 'warning',
      headline: 'Spending is 40.0 points ahead of delivery',
      detail: '75.0% of the planned budget is consumed and deliverables are 35.0% complete.',
      divergence: 40,
    });
  });

  it('calls out overspend as an error', () => {
    const result = describeDivergence(105, 55);
    expect(result.severity).toBe('error');
    expect(result.headline).toBe('Spending is 50.0 points ahead of delivery');
    expect(result.detail).toMatch(/Spending has passed the planned budget\.$/);
  });

  it('keeps a small gap informational and a lead in delivery positive', () => {
    expect(describeDivergence(70, 60)).toMatchObject({ severity: 'info', headline: 'Spending is 10.0 points ahead of delivery' });
    expect(describeDivergence(55, 60)).toMatchObject({
      severity: 'success',
      headline: 'Delivery is 5.0 points ahead of spending',
    });
    expect(describeDivergence(50, 50)).toMatchObject({ severity: 'success', headline: 'Spending and delivery are in step' });
  });

  it('explains a project without a planned budget', () => {
    expect(describeDivergence(null, 20)).toMatchObject({ severity: 'info', headline: 'No planned budget', divergence: null });
    expect(divergencePoints(undefined, 20)).toBeNull();
  });

  it('rounds to one decimal without floating point drift', () => {
    expect(divergencePoints(70.3, 50.1)).toBe(20.2);
    expect(roundOneDecimal(0.05)).toBe(0.1);
    expect(roundOneDecimal(-2.25)).toBe(-2.3);
  });
});

describe('risk helpers', () => {
  it('tones factor bars by their share of the maximum', () => {
    expect(factorTone(0, 20)).toBe('none');
    expect(factorTone(5, 20)).toBe('info');
    expect(factorTone(10, 20)).toBe('warning');
    expect(factorTone(10, 10)).toBe('error');
    expect(factorTone(3, 0)).toBe('none');
  });

  it('builds one chart row per factor: points on a track as long as the maximum, labelled after the bar', () => {
    const rows = factorChartRows(ALPHA_RISK.factors);
    expect(rows.map((row) => [row.key, row.filled, row.headroom, row.text, row.tone, row.labelOn])).toEqual([
      ['schedule', 16, 4, '16 / 20', 'warning', 'headroom'],
      ['blocked', 10, 5, '10 / 15', 'warning', 'headroom'],
      ['blast_radius', 15, 5, '15 / 20', 'warning', 'headroom'],
      ['resource', 12, 3, '12 / 15', 'warning', 'headroom'],
      ['budget', 15, 5, '15 / 20', 'warning', 'headroom'],
      ['deadline', 10, 0, '10 / 10', 'error', 'points'],
    ]);
    expect(rows.reduce((sum, row) => sum + row.filled, 0)).toBe(ALPHA_RISK.risk_score);
    expect(rows[0]).toMatchObject({ label: 'Schedule', detail: '2 overdue deliverables', points: 16, max: 20 });
  });

  it('labels an empty factor on its track and never draws past the maximum', () => {
    expect(factorChartRows([{ key: 'blocked', label: 'Blocked', points: 0, max_points: 15 }])[0]).toMatchObject({
      filled: 0,
      headroom: 15,
      tone: 'none',
      text: '0 / 15',
      labelOn: 'headroom',
      detail: '',
    });
    expect(factorChartRows([{ key: 'x', label: 'X', points: 25, max_points: 20 }])[0]).toMatchObject({
      filled: 20,
      headroom: 0,
      text: '25 / 20',
      labelOn: 'points',
    });
    expect(factorChartRows([{ key: 'y', label: 'Y', points: 0, max_points: 0 }])[0].labelOn).toBeNull();
    expect(factorChartRows(undefined)).toEqual([]);
  });

  it('describes depth in steps', () => {
    expect(depthLabel(1)).toBe('1 step downstream');
    expect(depthLabel(2)).toBe('2 steps downstream');
  });

  it('names audit entries and links records that still exist', () => {
    expect(describeAuditEntry({ entity_type: 'project', entity_id: 3, action: 'CREATE', after_state: { project_name: 'Gamma' } })).toEqual({
      typeLabel: 'Project',
      name: 'Gamma',
      href: '/projects/3',
    });
    expect(
      describeAuditEntry({ entity_type: 'budget_entry', entity_id: 9, action: 'UPDATE', after_state: { project_id: 2 } }),
    ).toEqual({ typeLabel: 'Budget entry', name: '#9', href: '/projects/2?tab=budget' });
    expect(
      describeAuditEntry({ entity_type: 'deliverable', entity_id: 4, action: 'UPDATE', after_state: { title: 'X', project_id: 1 } }).href,
    ).toBe('/projects/1?tab=deliverables');
    expect(describeAuditEntry({ entity_type: 'dependency', entity_id: 5, action: 'DELETE', before_state: {} })).toEqual({
      typeLabel: 'Dependency',
      name: '#5',
      href: null,
    });
    expect(describeAuditEntry({ entity_type: 'something_new', entity_id: 1, action: 'CREATE' }).typeLabel).toBe('Something new');
  });
});

describe('form field helpers', () => {
  it('validates money against NUMERIC(14, 2)', () => {
    expect(moneyError('150000')).toBeNull();
    expect(moneyError('150,000.50')).toBeNull();
    expect(moneyError('0', { allowZero: true })).toBeNull();
    expect(moneyError('0')).toBe('Amount must be greater than 0.');
    expect(moneyError('')).toMatch(/^Enter the amount/);
    expect(moneyError('12.345')).toBe('Amount can have at most 2 decimal places.');
    expect(moneyError('-5')).toMatch(/must be a number/);
    expect(moneyError('1e5')).toMatch(/must be a number/);
    expect(moneyError('1234567890123')).toBe('Amount is too large.');
    expect(moneyError('999999999999.99')).toBeNull();
  });

  it('formats amounts the way the API stores them', () => {
    expect(toMoneyString('1500')).toBe('1500.00');
    expect(toMoneyString('1,500.5')).toBe('1500.50');
    expect(toMoneyString('007.1')).toBe('7.10');
    expect(toMoneyString('0')).toBe('0.00');
  });

  it('checks dates, percentages and ids', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(dateError('', { required: true, missing: 'Pick one.' })).toBe('Pick one.');
    expect(dateError('')).toBeNull();
    expect(dateError('31/12/2026')).toBe('Enter a valid date.');
    expect(percentError('100', { label: 'Completion' })).toBeNull();
    expect(percentError('101', { label: 'Completion' })).toMatch(/0 to 100/);
    expect(percentError('4.5', { label: 'Completion' })).toMatch(/whole number/);
    expect(idOrNull('3')).toBe(3);
    expect(idOrNull('')).toBeNull();
    expect(currencySymbol()).toBe('$');
  });

  it('keeps only changed fields for updates', () => {
    expect(changedFields({ a: 1, b: null, c: 'x' }, { a: 1, b: 'y', c: 'x' })).toEqual({ b: null });
  });
});

describe('entity form models', () => {
  it('requires the project fields and checks the date order', () => {
    expect(Object.keys(validateProject(emptyProjectValues()))).toEqual([
      'project_name',
      'department_id',
      'start_date',
      'end_date',
      'planned_budget',
    ]);
    const values = { ...projectToValues(ALPHA), end_date: '2026-01-01' };
    expect(validateProject(values)).toEqual({ end_date: 'The end date must be on or after the start date.' });
    expect(validateProject({ ...projectToValues(ALPHA), project_name: 'x'.repeat(201) }).project_name).toMatch(/200/);
  });

  it('round-trips a project without changes and diffs edits', () => {
    expect(projectPayload(projectToValues(ALPHA))).toEqual({
      project_name: ALPHA.project_name,
      department_id: 1,
      project_manager_id: 2,
      status: 'ACTIVE',
      start_date: ALPHA.start_date,
      end_date: ALPHA.end_date,
      planned_budget: '400000.00',
      description: ALPHA.description,
    });
    expect(projectChanges(projectToValues(ALPHA), ALPHA)).toEqual({});
    expect(
      projectChanges({ ...projectToValues(ALPHA), project_manager_id: '', planned_budget: '400,000', description: ' ' }, ALPHA),
    ).toEqual({ project_manager_id: null, description: null });
  });

  it('applies the deliverable rules: done means 100%, blocked reason only when blocked', () => {
    expect(validateDeliverable({ ...emptyDeliverableValues(), title: 'T', due_date: '2026-12-01', status: 'DONE', completion_percentage: '80' })).toEqual({
      completion_percentage: 'A done deliverable is 100% complete.',
    });
    const done = deliverablePayload(
      { ...emptyDeliverableValues(), title: ' T ', due_date: '2026-12-01', status: 'DONE', completion_percentage: '100', blocked_reason: 'old' },
      1,
    );
    expect(done).toMatchObject({ project_id: 1, title: 'T', completion_percentage: 100, blocked_reason: null });
    const blocked = ALPHA_DELIVERABLES.find((item) => item.status === 'BLOCKED');
    expect(deliverableChanges({ ...deliverableToValues(blocked), status: 'IN_PROGRESS' }, blocked)).toEqual({
      status: 'IN_PROGRESS',
      blocked_reason: null,
    });
  });

  it('validates budget entries and builds their bodies', () => {
    expect(validateBudgetEntry({ category: 'TRAVEL', amount: '12.5', entry_date: '2026-11-01', description: '' })).toEqual({});
    expect(validateBudgetEntry({ category: 'FOOD', amount: '0', entry_date: '', description: 'x'.repeat(301) })).toEqual({
      category: 'Choose a category.',
      amount: 'Amount must be greater than 0.',
      entry_date: 'Choose the date of the spend.',
      description: 'Description must be at most 300 characters.',
    });
    expect(budgetEntryPayload({ category: 'TRAVEL', amount: '12.5', entry_date: '2026-11-01', description: '' }, 3)).toEqual({
      project_id: 3,
      category: 'TRAVEL',
      amount: '12.50',
      entry_date: '2026-11-01',
      description: null,
    });
    const entry = ALPHA_BUDGET_ENTRIES[0];
    expect(budgetEntryChanges({ category: entry.category, amount: entry.amount, entry_date: entry.entry_date, description: entry.description }, entry)).toEqual({});
  });

  it('validates the dependency pair', () => {
    expect(validateDependency({ predecessor_deliverable_id: '', successor_deliverable_id: '' })).toEqual({
      predecessor_deliverable_id: 'Choose the deliverable that must finish first.',
      successor_deliverable_id: 'Choose the deliverable that waits for it.',
    });
    expect(validateDependency({ predecessor_deliverable_id: '2', successor_deliverable_id: '2' })).toEqual({
      successor_deliverable_id: 'A deliverable cannot depend on itself.',
    });
    expect(validateDependency({ predecessor_deliverable_id: '5', successor_deliverable_id: '2' })).toEqual({});
  });
});
