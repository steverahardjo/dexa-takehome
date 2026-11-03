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

  @Column({ type: 'varchar', length: 120, nullable: true })
  division: string | null;

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
