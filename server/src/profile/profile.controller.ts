import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Patch,
  Put,
  Req,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { profileUpdateSchema, type ProfileUpdateInput } from "../contracts";
import type { AuthenticatedRequest } from "../auth/auth.guard";
import { ApiException } from "../platform/api.exception";
import { AuditService } from "../platform/audit.service";
import { DatabaseService } from "../platform/database.service";
import { AvatarStorageService } from "./avatar-storage.service";

@Controller("profile")
export class ProfileController {
  constructor(
    private readonly database: DatabaseService,
    private readonly avatars: AvatarStorageService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Header("Cache-Control", "private, no-store, max-age=0")
  async profile(@Req() request: AuthenticatedRequest) {
    const result = await this.database.query(
      `select p.id, p.name, p.timezone, p.units,
              p.faith_preference, p.prayer_enabled,
              p.onboarding_completed_at, p.suspended_at, p.deleted_at,
              p.created_at, p.updated_at,
              p.goal_preferences, p.starting_pace, p.religion_preference,
              p.daily_digest_time, p.daily_digest_enabled,
              p.latitude::float8 as latitude, p.longitude::float8 as longitude,
              p.location_updated_at, p.madhab, p.prayer_calculation_method,
              u.email, u.created_at as account_created_at,
              (p.avatar_object_path is not null) as has_avatar,
              p.avatar_updated_at,
              coalesce(
                (
                  select json_agg(
                    json_build_object(
                      'prayer_name', r.prayer_name,
                      'enabled', r.enabled,
                      'offset_minutes', r.offset_minutes
                    )
                    order by case r.prayer_name
                      when 'fajr' then 1 when 'dhuhr' then 2 when 'asr' then 3
                      when 'maghrib' then 4 else 5
                    end
                  )
                  from prayer_reminder_settings r
                  where r.user_id = p.id
                ),
                '[]'::json
              ) as prayer_reminders,
              exists (
                select 1 from firebase_installations f
                where f.user_id = p.id
                  and f.active = true
                  and f.last_seen_at >= now() - interval '30 days'
              ) as push_enabled
       from profiles p
       join users u on u.id = p.id
       where p.id = $1`,
      [request.user.id],
    );
    if (!result.rows[0]) {
      throw new ApiException(404, "PROFILE_NOT_FOUND", "Profile not found.");
    }
    return result.rows[0];
  }

  @Patch()
  async update(
    @Req() request: AuthenticatedRequest,
    @Body() input: ProfileUpdateInput,
  ) {
    const parsed = profileUpdateSchema.safeParse(input);
    if (!parsed.success) {
      throw new ApiException(
        400,
        "VALIDATION_ERROR",
        "Please check the submitted values.",
        false,
        issuesByField(parsed.error.issues),
      );
    }
    const result = await this.database.query(
      `update profiles
       set name = $2,
           timezone = $3,
           units = $4,
           updated_at = now()
       where id = $1 and deleted_at is null
       returning id, name, timezone, units, updated_at`,
      [
        request.user.id,
        parsed.data.name,
        parsed.data.timezone,
        parsed.data.units,
      ],
    );
    if (!result.rows[0]) {
      throw new ApiException(404, "PROFILE_NOT_FOUND", "Profile not found.");
    }
    await this.audit.record({
      actorId: request.user.id,
      action: "profile.updated",
      targetType: "profile",
      targetId: request.user.id,
      correlationId: request.correlationId,
      metadata: { fields: ["name", "timezone", "units"] },
    });
    return result.rows[0];
  }

  @Get("avatar")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async avatar(@Req() request: AuthenticatedRequest) {
    const result = await this.database.query<{ avatar_object_path: string | null }>(
      "select avatar_object_path from profiles where id = $1 and deleted_at is null",
      [request.user.id],
    );
    const objectPath = result.rows[0]?.avatar_object_path;
    if (!objectPath) {
      throw new ApiException(404, "AVATAR_NOT_FOUND", "Profile photo not found.");
    }
    const image = await this.avatars.read(objectPath);
    return new StreamableFile(image, {
      type: "image/webp",
      disposition: 'inline; filename="profile-avatar.webp"',
    });
  }

  @Put("avatar")
  @HttpCode(200)
  @UseInterceptors(FileInterceptor("file", {
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  }))
  async uploadAvatar(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new ApiException(
        400,
        "AVATAR_REQUIRED",
        "Choose a profile photo to upload.",
      );
    }
    const saved = await this.avatars.save(request.user.id, file.buffer);
    await this.database.query(
      `update profiles
       set avatar_object_path = $2,
           avatar_updated_at = $3,
           updated_at = now()
       where id = $1 and deleted_at is null`,
      [request.user.id, saved.objectPath, saved.updatedAt],
    );
    await this.audit.record({
      actorId: request.user.id,
      action: "profile.avatar_updated",
      targetType: "profile",
      targetId: request.user.id,
      correlationId: request.correlationId,
    });
    return {
      has_avatar: true,
      avatar_updated_at: saved.updatedAt.toISOString(),
    };
  }

  @Delete("avatar")
  @HttpCode(200)
  async deleteAvatar(@Req() request: AuthenticatedRequest) {
    const result = await this.database.query<{ avatar_object_path: string | null }>(
      "select avatar_object_path from profiles where id = $1 and deleted_at is null",
      [request.user.id],
    );
    const objectPath = result.rows[0]?.avatar_object_path;
    if (objectPath) await this.avatars.remove(objectPath);
    await this.database.query(
      `update profiles
       set avatar_object_path = null,
           avatar_updated_at = now(),
           updated_at = now()
       where id = $1 and deleted_at is null`,
      [request.user.id],
    );
    await this.audit.record({
      actorId: request.user.id,
      action: "profile.avatar_removed",
      targetType: "profile",
      targetId: request.user.id,
      correlationId: request.correlationId,
    });
    return { has_avatar: false, avatar_updated_at: new Date().toISOString() };
  }
}

function issuesByField(issues: Array<{ path: PropertyKey[]; message: string }>) {
  return issues.reduce<Record<string, string[]>>((fields, issue) => {
    const key = String(issue.path[0] ?? "form");
    fields[key] = [...(fields[key] ?? []), issue.message];
    return fields;
  }, {});
}
