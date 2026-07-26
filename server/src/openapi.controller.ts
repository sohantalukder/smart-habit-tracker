import { Controller, Get, Header } from "@nestjs/common";
import { Public } from "./auth/auth.guard";
import document from "./openapi/openapi.json";

@Public()
@Controller()
export class OpenApiController {
  @Get("openapi.json")
  @Header("Cache-Control", "public, max-age=300")
  openapi() {
    return document;
  }
}
