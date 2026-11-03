import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { env } from '../config/env.js';

/**
 * One MySQL database shared by the three containers. `synchronize` is on by
 * default outside production; deployments should run migrations instead.
 */
@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: env.string('DB_HOST', 'localhost'),
      port: env.int('DB_PORT', 3306),
      username: env.string('DB_USERNAME', 'attendance'),
      password: env.string('DB_PASSWORD', 'attend1234'),
      database: env.string('DB_DATABASE', 'absences'),
      charset: 'utf8mb4',
      autoLoadEntities: true,
      synchronize: env.bool(
        'DB_SYNCHRONIZE',
        process.env.NODE_ENV !== 'production',
      ),
      logging: env.bool('DB_LOGGING', false),
      retryAttempts: env.int('DB_RETRY_ATTEMPTS', 15),
      retryDelay: env.int('DB_RETRY_DELAY_MS', 3000),
    }),
  ],
})
export class DatabaseModule {}
