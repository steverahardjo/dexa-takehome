import { Controller, Get } from '@nestjs/common';

import { env } from '../config/env.js';

/** What the compose healthcheck polls. */
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok'; service: string; time: string } {
    return {
      status: 'ok',
      service: env.string('SERVICE_NAME', 'api'),
      time: new Date().toISOString(),
    };
  }
}
