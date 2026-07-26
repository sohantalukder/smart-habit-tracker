import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthGuard } from "./auth/auth.guard";
import { DatabaseService } from "./platform/database.service";
import { AuditService } from "./platform/audit.service";
import { QueueService } from "./platform/queue.service";
import { HealthController } from "./health.controller";
import { UserController } from "./user.controller";
import { AdminController } from "./admin.controller";
import { OpenApiController } from "./openapi.controller";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { AuthRateLimitService } from "./auth/auth-rate-limit.service";
import { VerificationEmailService } from "./auth/verification-email.service";
import { ExperienceController } from "./experience.controller";
import { PrayerTimeService } from "./prayer/prayer-time.service";
import { ProfileController } from "./profile/profile.controller";
import { AvatarStorageService } from "./profile/avatar-storage.service";

@Module({
  controllers: [
    HealthController,
    OpenApiController,
    AuthController,
    ProfileController,
    UserController,
    ExperienceController,
    AdminController,
  ],
  providers: [
    DatabaseService,
    AuditService,
    QueueService,
    AuthService,
    AuthRateLimitService,
    VerificationEmailService,
    PrayerTimeService,
    AvatarStorageService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
