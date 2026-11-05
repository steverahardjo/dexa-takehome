import { Inject, Injectable } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';

import type { AttendanceView } from '../../../../shared/contracts/attendance.contracts.js';
import { ATTENDANCE_PATTERNS } from '../../../../shared/contracts/attendance.contracts.js';
import { EMPLOYEE_PATTERNS } from '../../../../shared/contracts/employee.contracts.js';
import type { EmployeeView } from '../../../../shared/contracts/employee.contracts.js';
import type { MeView } from '../../../../shared/contracts/gateway.contracts.js';
import { sendRpc } from '../../../../shared/rpc/rpc-call.js';
import { ATTENDANCE_CLIENT, EMPLOYEE_CLIENT } from '../clients/tokens.js';

/**
 * The signed-in person plus their attendance for one day.
 *
 * Employees and attendance live in separate databases, so this view can only be
 * composed here: the gateway is the one place that talks to both services.
 */
@Injectable()
export class MeService {
  constructor(
    @Inject(EMPLOYEE_CLIENT) private readonly employees: ClientProxy,
    @Inject(ATTENDANCE_CLIENT) private readonly attendance: ClientProxy,
  ) {}

  async view(employeeId: string, date?: string): Promise<MeView> {
    const payload = date ? { employeeId, date } : { employeeId };

    const [employee, attendance] = await Promise.all([
      sendRpc<EmployeeView>(
        this.employees,
        EMPLOYEE_PATTERNS.get,
        { id: employeeId },
        'Could not load the employee',
      ),
      sendRpc<AttendanceView | null>(
        this.attendance,
        ATTENDANCE_PATTERNS.dayOf,
        payload,
        'Could not load the attendance for the day',
      ),
    ]);

    return { ...employee, attendance };
  }
}
