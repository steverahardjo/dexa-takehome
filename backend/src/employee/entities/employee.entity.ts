import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** The roles the frontend offers in the employee form. */
export const ROLES = ['Employee', 'Manager', 'HR Admin'] as const;
export type Role = (typeof ROLES)[number];

/**
 * The divisions the employee form offers. The form is a single-choice MCQ, so
 * every employee belongs to exactly one of these — the column is an enum and
 * anything else is rejected by the DTO.
 */
export const DIVISIONS = [
  'Sales',
  'Human Resources',
  'Engineering',
  'Finance',
  'Operations',
] as const;
export type Division = (typeof DIVISIONS)[number];

/**
 * One row per person. The email is the login identity: there is no separate
 * credentials table, because signing in is an OTP sent to this address.
 */
@Entity('employees')
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 190 })
  email: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone: string | null;

  @Column({ type: 'enum', enum: ROLES, default: 'Employee' })
  role: Role;

  /** Single choice from `DIVISIONS`; the DTO rejects anything else. */
  @Column({ type: 'enum', enum: DIVISIONS })
  division: Division;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  /** `YYYY-MM-DD`; TypeORM hydrates `date` columns as this string. */
  @Column({ type: 'date', nullable: true })
  contractExpiry: string | null;

  @Column({ type: 'text', nullable: true })
  avatar: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
