import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Attendance } from '../employee/entities/attendance.entity.js';
import { Employee } from '../employee/entities/employee.entity.js';
import { SeedService } from './seed.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Employee, Attendance])],
  providers: [SeedService],
})
export class SeedModule {}
