import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/auth.guard";
import { syncPushSchema } from "../contracts";
import { SyncService } from "./sync.service";

@Controller("sync")
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post("push")
  push(@Req() request: AuthenticatedRequest, @Body() input: unknown) {
    const parsed = syncPushSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.sync.push(request.user.id, parsed.data);
  }

  @Get("pull")
  pull(
    @Req() request: AuthenticatedRequest,
    @Query("cursor") cursor?: string,
    @Query("limit") rawLimit?: string,
  ) {
    const limit = rawLimit === undefined ? 500 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new BadRequestException("Limit must be between 1 and 500.");
    }
    return this.sync.pull(request.user.id, cursor, limit);
  }
}
