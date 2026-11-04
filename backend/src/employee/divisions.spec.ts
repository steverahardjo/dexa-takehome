import { describe, expect, it } from 'vitest';

import { toDivision } from './divisions.js';
import { DIVISIONS } from './entities/employee.entity.js';

describe('toDivision', () => {
  it('keeps every offered division', () => {
    for (const division of DIVISIONS) {
      expect(toDivision(division)).toBe(division);
    }
  });

  it('matches regardless of case and surrounding whitespace', () => {
    expect(toDivision('  engineering ')).toBe('Engineering');
    expect(toDivision('HUMAN RESOURCES')).toBe('Human Resources');
  });

  it('maps legacy free text to the nearest option', () => {
    expect(toDivision('People Operations')).toBe('Human Resources');
    expect(toDivision('Marketing')).toBe('Sales');
    expect(toDivision('Design')).toBe('Engineering');
    expect(toDivision('Accounting')).toBe('Finance');
  });

  it('returns null when there is nothing to map', () => {
    expect(toDivision('')).toBeNull();
    expect(toDivision('   ')).toBeNull();
    expect(toDivision(null)).toBeNull();
    expect(toDivision(undefined)).toBeNull();
    expect(toDivision('Astronaut')).toBeNull();
  });
});
