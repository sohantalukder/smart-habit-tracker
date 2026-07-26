import { Controller, Get } from "@nestjs/common";
import { Public } from "./auth/auth.guard";

@Public()
@Controller()
export class ApiController {
  @Get()
  root() {
    return {
      status: "ok",
      service: "bloom-api",
      version: "v1",
      links: {
        health: "/v1/health",
        readiness: "/v1/health/ready",
        openapi: "/v1/openapi.json",
      },
    };
  }
}
