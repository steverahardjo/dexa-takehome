import { Module, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDataSourceOptions } from './data-source.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => {
        const options = buildDataSourceOptions();
        new Logger('Database').log(
          `Connecting to postgres://${String(options && 'host' in options ? options.host : '')}/${String(
            options && 'database' in options ? options.database : '',
          )}`,
        );
        return options;
      },
    }),
  ],
})
export class DatabaseModule {}
