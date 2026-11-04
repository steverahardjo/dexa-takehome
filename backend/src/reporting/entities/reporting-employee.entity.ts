import {
  Column,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EmploymentStatus } from '../../common/enums/roles.enum.js';

/** Reporting projection of an employee. Employee module stays authoritative. */
@Entity({ name: 'reporting_employees' })
@Index(['employeeNumber'], { unique: true })
export class ReportingEmployee {
  @PrimaryColumn({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'employee_number', type: 'varchar', length: 32 })
  employeeNumber: string;

  @Column({ name: 'employee_name', type: 'varchar', length: 255 })
  employeeName: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({
    name: 'employment_status',
    type: 'enum',
    enum: EmploymentStatus,
    enumName: 'employment_status_enum',
  })
  employmentStatus: EmploymentStatus;

  /** Comma-separated division names, denormalised for the dashboard. */
  @Column({ name: 'division_names', type: 'varchar', length: 512, default: '' })
  divisionNames: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
