import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AuthGuard } from '../../../auth/guards/jwt.guard.js';
import {
  EMPLOYEE_PATTERNS,
  type DivisionView,
} from '../../../../shared/contracts/employee.contracts.js';
import { Role } from '../../../../shared/enums/roles.enum.js';
import { sendRpc } from '../../../../shared/rpc/rpc-call.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { EMPLOYEE_CLIENT } from '../clients/tokens.js';
import { OPENAPI_SECURITY } from '../docs/openapi.js';
import { DivisionModel } from '../docs/models.js';

/**
 * The divisions an employee can belong to.
 *
 * The employee form needs the ids to send as `divisionIds`, and the dashboard
 * needs the names to render them. There are only a handful, so the list is not
 * paginated. Creating divisions is not part of the API yet.
 */
@ApiTags('Admin: divisions')
@ApiBearerAuth(OPENAPI_SECURITY)
@ApiUnauthorizedResponse({ description: 'Missing, expired or malformed token' })
@ApiForbiddenResponse({ description: 'The caller is not an admin' })
@ApiBadRequestResponse({ description: 'Query did not validate' })
@Controller('admin/divisions')
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MASTER_ADMIN)
export class AdminDivisionsController {
  constructor(@Inject(EMPLOYEE_CLIENT) private readonly employees: ClientProxy) {}

  @Get()
  @ApiOperation({
    summary: 'List divisions',
    description:
      'Alphabetical, unpaginated. `id` is what `divisionIds` on an employee expects.',
  })
  @ApiOkResponse({
    type: [DivisionModel],
    description: 'Every division',
  })
  list(): Promise<DivisionView[]> {
    return sendRpc<DivisionView[]>(
      this.employees,
      EMPLOYEE_PATTERNS.divisions,
      {},
      'Could not list divisions',
    );
  }
}
