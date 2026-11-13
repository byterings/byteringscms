import { Global, Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { APP_ENV } from '../config/config.module';
import { type Env } from '../config/env';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import {
  createS3Client,
  LocalStorageDriver,
  S3StorageDriver,
  STORAGE_DRIVER,
  type StorageDriver,
} from './storage';

@Global()
@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [APP_ENV],
      useFactory: (env: Env) => ({
        storage: memoryStorage(),
        limits: { fileSize: env.MEDIA_MAX_BYTES, files: 1, fields: 5 },
      }),
    }),
  ],
  controllers: [MediaController],
  providers: [
    MediaService,
    {
      provide: STORAGE_DRIVER,
      inject: [APP_ENV],
      useFactory: (env: Env): StorageDriver =>
        env.STORAGE_DRIVER === 's3'
          ? new S3StorageDriver(
              createS3Client({
                region: env.S3_REGION,
                endpoint: env.S3_ENDPOINT,
                accessKeyId: env.S3_ACCESS_KEY_ID,
                secretAccessKey: env.S3_SECRET_ACCESS_KEY,
                forcePathStyle: env.S3_FORCE_PATH_STYLE,
              }),
              env.S3_BUCKET!,
            )
          : new LocalStorageDriver(env.STORAGE_LOCAL_DIR),
    },
  ],
  exports: [MediaService, STORAGE_DRIVER],
})
export class MediaModule {}
