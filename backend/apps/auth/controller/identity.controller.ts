import { Controller, UsePipes } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import {
  AUTH_PATTERNS,
  type DeletedIdentity,
  type IdentitySummary,
} from '../../../shared/contracts/auth.contracts.js';
import { rpcValidationPipe } from '../../../shared/rpc/rpc-validation.pipe.js';
import {
  CreateIdentityDto,
  DeleteIdentityDto,
  UpdateIdentityDto,
} from '../dto/identity.dto.js';
import { IdentityService } from '../services/identity.service.js';

/**
 * Internal TCP API of the auth service, called by employee to keep the identity
 * it owns in sync. Request/response: employee awaits the answer and rolls its
 * own write back when this fails.
 */
@Controller()
@UsePipes(rpcValidationPipe)
export class IdentityController {
  constructor(private readonly identities: IdentityService) {}

  @MessagePattern(AUTH_PATTERNS.createIdentity)
  create(@Payload() dto: CreateIdentityDto): Promise<IdentitySummary> {
    return this.identities.create(dto);
  }

  @MessagePattern(AUTH_PATTERNS.updateIdentity)
  update(@Payload() dto: UpdateIdentityDto): Promise<IdentitySummary> {
    return this.identities.update(dto);
  }

  @MessagePattern(AUTH_PATTERNS.deleteIdentity)
  remove(@Payload() dto: DeleteIdentityDto): Promise<DeletedIdentity> {
    return this.identities.remove(dto.employeeId);
  }
}
