import { afterEach, describe, expect, it, vi } from 'vitest';
import { categoryLabel, locationText, sumCounts, timeAgo, titleCase } from './format';
import { matchPath } from '../router';

describe('format helpers', () => {
  afterEach(() => vi.useRealTimers());

  it('labels categories and enum values', () => {
    expect(categoryLabel('hvac')).toBe('HVAC');
    expect(categoryLabel('it_hardware')).toBe('IT hardware');
    expect(categoryLabel('plumbing')).toBe('Plumbing');
    expect(titleCase('in_progress')).toBe('In Progress');
    expect(titleCase(null)).toBe('');
  });

  it('sums status counts, treating missing ones as zero', () => {
    expect(sumCounts({ open: 2, assigned: 1 }, ['open', 'assigned', 'on_hold'])).toBe(3);
    expect(sumCounts(undefined, ['open'])).toBe(0);
  });

  it('describes how long ago something happened', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-18T12:00:00Z'));
    expect(timeAgo('2026-11-18T11:59:30Z')).toBe('just now');
    expect(timeAgo('2026-11-18T11:59:00Z')).toBe('1 minute ago');
    expect(timeAgo('2026-11-18T09:00:00Z')).toBe('3 hours ago');
    expect(timeAgo('2026-11-16T12:00:00Z')).toBe('2 days ago');
  });

  it('joins only the location parts that exist', () => {
    expect(locationText({ building: 'HQ', floor: 'Floor 1', seat: '1A', location_details: null })).toBe('HQ · Floor 1 · Seat 1A');
    expect(locationText({ building: 'HQ', location_details: 'Kitchen' })).toBe('HQ · Kitchen');
  });
});

describe('matchPath', () => {
  it('extracts params and rejects other paths', () => {
    expect(matchPath('/incidents/:id', '/incidents/42')).toEqual({ id: '42' });
    expect(matchPath('/incidents/:id', '/incidents/42?tab=notes')).toEqual({ id: '42' });
    expect(matchPath('/incidents/:id', '/incidents')).toBeNull();
    expect(matchPath('/incidents/:id', '/engineers/42')).toBeNull();
  });
});
