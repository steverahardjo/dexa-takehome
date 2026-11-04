import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { AdminModule } from './admin/admin.module.js';

@Module({
  imports: [AdminModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
