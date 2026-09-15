import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { AppConfigModule } from './common/config/app-config.module';
import { HashingModule } from './common/hashing/hashing.module';
import { UploadModule } from './upload/upload.module';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { AuthModule } from './auth/auth.module';
import { authEnvSchema } from './common/config/auth-env.schema';

// Skeleton modules
import { StudentsModule } from './students/students.module';
import { ClassesModule } from './classes/classes.module';
import { EventsModule } from './events/events.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { ExportModule } from './export/export.module';
import { TeamsModule } from './teams/teams.module';
import { RegistrationsModule } from './registrations/registrations.module';
import { SystemSettingModule } from './system-setting/system-setting.module';
import { MailerModule } from './auth/mailer/mailer.module';

@Module({
  imports: [
    AppConfigModule.forProject(authEnvSchema),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('THROTTLE_TTL')! * 1000,
            limit: config.get<number>('THROTTLE_LIMIT')!,
            getTracker: (req: {
              headers: Record<string, unknown>;
              ip?: string;
            }) =>
              (req.headers['cf-connecting-ip'] as string) ||
              (req.headers['x-forwarded-for'] as string)
                ?.split(',')[0]
                ?.trim() ||
              req.ip ||
              'unknown',
          },
        ],
      }),
    }),
    HashingModule,
    PrismaModule,
    UploadModule,

    AuthModule,
    StudentsModule,
    ClassesModule,
    SystemSettingModule,
    EventsModule,
    AnnouncementsModule,
    ExportModule,
    TeamsModule,
    RegistrationsModule,
    MailerModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
