import { NestFactory } from '@nestjs/core';
import { EmployeeModule } from './employee.module.js';

async function bootstrap() {
  const app = await NestFactory.create(EmployeeModule);
  await app.listen(process.env.port ?? 3000);
}
await bootstrap();
