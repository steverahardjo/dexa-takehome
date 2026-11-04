import { Module } from '@nestjs/common';
import { AdminController } from './controllers/admin/admin.controller.js';
import { AdminService } from './services/admin/admin.service.js';
import { ReportingController } from './controllers/reporting/reporting.controller.js';
import { ReportingService } from './services/reporting/reporting.service.js';

@Module({
  controllers: [AdminController, ReportingController],
  providers: [AdminService, ReportingService]
})
export class AdminModule {}
