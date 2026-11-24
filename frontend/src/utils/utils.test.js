import {
  CURRENCY,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPct,
  toNumber,
} from './format.js';
import {
  describeFormError,
  isValidEmail,
  utf8Length,
  validateLogin,
  validateRegistration,
} from './validation.js';
import { humanize, toOptions, PROJECT_STATUSES, STATUS_LABELS } from '../constants.js';
import theme, { RISK_COLORS, riskColor, statusColor } from '../theme.js';
import { getContrastRatio } from '@mui/material/styles';

describe('format', () => {
  it('uses one currency for every amount', () => {
    expect(CURRENCY).toBe('USD');
    expect(formatMoney('400000.00')).toBe('$400,000.00');
    expect(formatMoney(105000)).toBe('$105,000.00');
    expect(formatMoney('-10000.00')).toBe('-$10,000.00');
    expect(formatMoney('400000.00', { compact: true })).toBe('$400K');
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney('abc')).toBe('—');
  });

  it('formats percentages with one decimal', () => {
    expect(formatPct(75)).toBe('75.0%');
    expect(formatPct('35.04')).toBe('35.0%');
    expect(formatPct(105, { digits: 0 })).toBe('105%');
    expect(formatPct(null)).toBe('—');
  });

  it('formats calendar dates without time-zone drift', () => {
    expect(formatDate('2026-11-25')).toBe('Nov 25, 2026');
    expect(formatDate('2026-01-01T23:30:00+05:30')).toBe('Jan 1, 2026');
    expect(formatDate('')).toBe('—');
    expect(formatDate('soon')).toBe('soon');
    expect(formatDateTime('2026-11-25T10:00:00Z')).toMatch(/Nov 25, 2026/);
    expect(formatDateTime('not a date')).toBe('not a date');
    expect(formatDateTime(null)).toBe('—');
  });

  it('parses numbers defensively', () => {
    expect(toNumber('12.50')).toBe(12.5);
    expect(toNumber(3)).toBe(3);
    expect(toNumber('')).toBeNull();
    expect(toNumber(undefined)).toBeNull();
    expect(toNumber(Number.NaN)).toBeNull();
    expect(formatNumber(12000)).toBe('12,000');
    expect(formatNumber(null)).toBe('—');
  });
});

describe('validation', () => {
  it('checks email shape', () => {
    expect(isValidEmail('pm@acme.example')).toBe(true);
    expect(isValidEmail(' pm@acme.example ')).toBe(true);
    expect(isValidEmail('pm@acme')).toBe(false);
    expect(isValidEmail('pm acme@x.io')).toBe(false);
  });

  it('measures passwords in UTF-8 bytes like the server', () => {
    expect(utf8Length('abcdefgh')).toBe(8);
    expect(utf8Length('éé')).toBe(4);
    expect(utf8Length(null)).toBe(0);
    expect(validateRegistration({ name: 'A', email: 'a@b.co', password: 'é'.repeat(37), confirmPassword: 'é'.repeat(37) }).password).toBe(
      'Password must be at most 72 bytes.',
    );
  });

  it('validates the login form', () => {
    expect(validateLogin({ email: '', password: '' })).toEqual({
      email: 'Enter your email address.',
      password: 'Enter your password.',
    });
    expect(validateLogin({ email: `${'a'.repeat(250)}@b.com`, password: 'x' }).email).toMatch(/at most 255/);
    expect(validateLogin({ email: 'pm@acme.example', password: 'x' })).toEqual({});
  });

  it('validates the registration form', () => {
    expect(validateRegistration({ name: 'x'.repeat(151), email: 'a@b.co', password: 'longenough', confirmPassword: 'longenough' })).toEqual({
      name: 'Name must be at most 150 characters.',
    });
    expect(validateRegistration({ name: 'Asha Rao', email: 'a@b.co', password: 'longenough', confirmPassword: 'longenough' })).toEqual({});
  });

  it('splits server details into field errors and a summary', () => {
    const error = {
      message: 'The request is not valid.',
      details: [
        { field: 'email', issue: 'Already registered.' },
        { field: 'department_id', issue: 'Unknown department.' },
        { field: 'request', issue: 'Malformed body.' },
      ],
    };
    expect(describeFormError(error, ['email'])).toEqual({
      fieldErrors: { email: 'Already registered.' },
      message: 'The request is not valid. department_id: Unknown department. Malformed body.',
    });
    expect(describeFormError(null, ['email'])).toEqual({
      fieldErrors: {},
      message: 'Something went wrong. Please try again.',
    });
  });
});

describe('constants', () => {
  it('humanizes enum values and builds options', () => {
    expect(humanize('ON_HOLD')).toBe('On hold');
    expect(humanize('')).toBe('');
    expect(toOptions(PROJECT_STATUSES, STATUS_LABELS)[2]).toEqual({ value: 'ON_HOLD', label: 'On hold' });
    expect(toOptions(['NEW_THING'])).toEqual([{ value: 'NEW_THING', label: 'New thing' }]);
  });
});

describe('theme colours', () => {
  it('defines one colour per risk level and readable chip text', () => {
    expect(riskColor('CRITICAL')).toBe(RISK_COLORS.CRITICAL);
    expect(riskColor('UNKNOWN')).toBe('#757575');
    ['riskLow', 'riskMedium', 'riskHigh', 'riskCritical'].forEach((key) => {
      const { main, contrastText } = theme.palette[key];
      expect(getContrastRatio(main, contrastText)).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('maps statuses to theme colours', () => {
    expect(statusColor('BLOCKED')).toBe(theme.palette.error.main);
    expect(statusColor('CANCELLED')).toBe('#757575');
    expect(statusColor('NOPE')).toBe('#757575');
  });
});
