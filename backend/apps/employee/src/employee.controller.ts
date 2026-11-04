import { Controller, Get } from '@nestjs/common';
import { EmployeeService } from './employee.service.js';

@Controller()
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Get()
  getHello(): string {
    return this.employeeService.getHello();
  }
}
