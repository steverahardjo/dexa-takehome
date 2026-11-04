import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MemoryStorageService } from './memory-storage.service.js';
import { S3StorageService } from './s3-storage.service.js';
import { STORAGE_PROVIDER, type StorageProvider } from './storage.interface.js';
import { StorageController } from './storage.controller.js';

@Module({
  controllers: [StorageController],
  providers: [
    MemoryStorageService,
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService, MemoryStorageService],
      useFactory: (
        config: ConfigService,
        memory: MemoryStorageService,
      ): StorageProvider => {
        const provider = config.get<string>('storage.provider', 'memory');
        return provider === 's3' ? new S3StorageService(config) : memory;
      },
    },
  ],
  exports: [STORAGE_PROVIDER, MemoryStorageService],
})
export class StorageModule {}
