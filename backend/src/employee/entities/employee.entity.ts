import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EmploymentStatus } from '../../common/enums/roles.enum.js';
import { Division } from './division.entity.js';
import { EmployeeStatusHistory } from './employee-status-history.entity.js';
import { WorkSchedule } from './work-schedule.entity.js';

@Entity({ name: 'employees' })
@Index(['employeeNumber'], { unique: true })
@Index(['email'])
@Index(['employmentStatus'])
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'employee_number', type: 'varchar', length: 32, unique: true })
  employeeNumber: string;

  @Column({ name: 'full_name', type: 'varchar', length: 255 })
  fullName: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone: string | null;

  @Column({
    name: 'employment_status',
    type: 'enum',
    enum: EmploymentStatus,
    enumName: 'employment_status_enum',
    default: EmploymentStatus.ACTIVE,
  })
  employmentStatus: EmploymentStatus;

  @Column({ name: 'joined_at', type: 'date' })
  joinedAt: string;

  @Column({ name: 'terminated_at', type: 'date', nullable: true })
  terminatedAt: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToMany(() => Division, { eager: false })
  @JoinTable({
    name: 'employee_divisions',
    joinColumn: { name: 'employee_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'division_id', referencedColumnName: 'id' },
  })
  divisions: Division[];

  @OneToMany(() => EmployeeStatusHistory, (history) => history.employee)
  statusHistory: EmployeeStatusHistory[];

  @OneToMany(() => WorkSchedule, (schedule) => schedule.employee)
  schedules: WorkSchedule[];
}
