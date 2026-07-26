import { Injectable } from "@nestjs/common";
import { DatabaseService } from "./database.service";

@Injectable()
export class AuditService {
  constructor(private readonly database: DatabaseService) {}

  async record(input: {
    actorId: string;
    action: string;
    targetType: string;
    targetId?: string;
    correlationId: string;
    metadata?: unknown;
  }) {
    await this.database.query(
      `insert into audit_logs (
         actor_id, action, target_type, target_id, correlation_id, metadata
       )
       values ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        input.actorId,
        input.action,
        input.targetType,
        input.targetId ?? null,
        input.correlationId,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  }
}
