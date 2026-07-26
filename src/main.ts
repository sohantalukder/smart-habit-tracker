import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { existsSync } from "node:fs";
import path from "node:path";
import { AppModule } from "./app.module";
import { ErrorFilter } from "./platform/error.filter";
import { createOriginPolicy } from "./platform/cors";

loadLocalEnvironment();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.getHttpAdapter().getInstance().set("trust proxy", 1);
  app.setGlobalPrefix("v1");
  const allowsOrigin = createOriginPolicy(process.env);
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      const allowed = allowsOrigin(origin);
      callback(allowed ? null : new Error("Origin is not allowed."), allowed);
    },
    credentials: false,
    allowedHeaders: ["authorization", "content-type", "idempotency-key", "x-correlation-id"],
    exposedHeaders: ["x-correlation-id"],
  });
  app.useGlobalFilters(new ErrorFilter());
  await app.listen(Number(process.env.PORT ?? 4000), "0.0.0.0");
}

void bootstrap();

function loadLocalEnvironment() {
  if (process.env.NODE_ENV === "production") return;
  const envFile = path.resolve(process.cwd(), ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}
