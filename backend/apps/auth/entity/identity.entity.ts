import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { IdentityStatus, Role } from '../../../shared/enums/roles.enum.js';

@Entity({ name: 'identities' })
@Index(['employeeId'])
export class Identity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({
    type: 'enum',
    enum: Role,
    enumName: 'role_enum',
    default: Role.EMPLOYEE,
  })
  role: Role;

  @Column({
    type: 'enum',
    enum: IdentityStatus,
    enumName: 'identity_status_enum',
    default: IdentityStatus.ACTIVE,
  })
  status: IdentityStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
