import { describe, expect, it } from 'vitest';
import {
  formatDays, formatHours, formatMoney, parseDate, todayIso,
} from '../utils/format';
import * as v from '../utils/validators';

describe('format helpers', () => {
  it('formats hours and 8-hour days', () => {
    expect(formatHours(12.5)).toBe('12.5 h');
    expect(formatDays(8)).toBe('1 day');
    expect(formatDays(20)).toBe('2.5 days');
  });

  it('formats money without cents', () => {
    expect(formatMoney(120000)).toBe('$120,000');
  });

  it('parses ISO dates as local dates', () => {
    const d = parseDate('2026-01-05');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 0, 5]);
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('validators', () => {
  it('flags missing required values', () => {
    expect(v.required('', 'Name')).toBe('Name is required.');
    expect(v.required('x')).toBeUndefined();
  });

  it('validates email and username', () => {
    expect(v.email('nope')).toBeTruthy();
    expect(v.email('a@b.co')).toBeUndefined();
    expect(v.username('ab')).toBeTruthy();
    expect(v.username('jane.doe')).toBeUndefined();
  });

  it('checks date order and numbers', () => {
    expect(v.dateOrder('2026-02-01', '2026-01-01')).toBeTruthy();
    expect(v.dateOrder('2026-01-01', '2026-01-01')).toBeUndefined();
    expect(v.nonNegative('-1')).toBeTruthy();
    expect(v.nonNegative('')).toBeUndefined();
  });

  it('keeps hours between 0 and 24', () => {
    expect(v.hours('')).toBeTruthy();
    expect(v.hours('0')).toBeTruthy();
    expect(v.hours('25')).toBeTruthy();
    expect(v.hours('7.5')).toBeUndefined();
    expect(v.minLength('abc', 8)).toBeTruthy();
  });
});
