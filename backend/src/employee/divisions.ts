import { DIVISIONS, type Division } from './entities/employee.entity.js';

/**
 * Free-text divisions that predate the MCQ. Seeded rows and older databases
 * still carry these; each one maps to the closest option we now offer.
 */
const LEGACY_DIVISIONS: Record<string, Division> = {
  'people operations': 'Human Resources',
  'people ops': 'Human Resources',
  people: 'Human Resources',
  hr: 'Human Resources',
  'human resource': 'Human Resources',
  marketing: 'Sales',
  growth: 'Sales',
  sales: 'Sales',
  design: 'Engineering',
  product: 'Engineering',
  it: 'Engineering',
  technology: 'Engineering',
  tech: 'Engineering',
  engineering: 'Engineering',
  finance: 'Finance',
  accounting: 'Finance',
  operations: 'Operations',
  ops: 'Operations',
  'business operations': 'Operations',
};

/** The division stored under `value`, or `null` when there is no match. */
export function toDivision(value: string | null | undefined): Division | null {
  const text = value?.trim().toLowerCase();

  if (!text) return null;

  const known = DIVISIONS.find((division) => division.toLowerCase() === text);

  return known ?? LEGACY_DIVISIONS[text] ?? null;
}
