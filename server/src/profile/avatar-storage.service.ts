import { Injectable } from "@nestjs/common";
import {
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getStorage, type Storage } from "firebase-admin/storage";
import sharp, { type Metadata, type Sharp } from "sharp";
import { ApiException } from "../platform/api.exception";

const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const MAX_INPUT_PIXELS = 24_000_000;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);

@Injectable()
export class AvatarStorageService {
  private storage: Storage | null | undefined;
  private bucketName: string | null | undefined;

  async save(userId: string, input: Buffer) {
    if (!input.length || input.length > MAX_INPUT_BYTES) {
      throw new ApiException(
        413,
        "AVATAR_TOO_LARGE",
        "Choose an image smaller than 5 MB.",
      );
    }
    let image: Sharp;
    let metadata: Metadata;
    try {
      image = sharp(input, {
        animated: false,
        failOn: "error",
        limitInputPixels: MAX_INPUT_PIXELS,
      });
      metadata = await image.metadata();
    } catch {
      throw invalidImage();
    }
    if (
      !metadata.format ||
      !ACCEPTED_FORMATS.has(metadata.format) ||
      !metadata.width ||
      !metadata.height ||
      (metadata.pages ?? 1) > 1
    ) {
      throw invalidImage();
    }

    let normalized: Buffer;
    try {
      normalized = await image
        .rotate()
        .resize(512, 512, { fit: "cover", position: "centre" })
        .webp({ quality: 82, effort: 5 })
        .toBuffer();
    } catch {
      throw invalidImage();
    }

    const objectPath = `profile-avatars/${userId}/avatar.webp`;
    try {
      await this.bucket().file(objectPath).save(normalized, {
        resumable: false,
        contentType: "image/webp",
        metadata: {
          cacheControl: "private, no-store, max-age=0",
        },
      });
    } catch (error) {
      this.logStorageFailure("save", error);
      throw storageUnavailable();
    }
    return { objectPath, updatedAt: new Date() };
  }

  async read(objectPath: string) {
    try {
      const [buffer] = await this.bucket().file(objectPath).download();
      return buffer;
    } catch (error) {
      this.logStorageFailure("read", error);
      throw storageUnavailable();
    }
  }

  async remove(objectPath: string) {
    try {
      await this.bucket().file(objectPath).delete({ ignoreNotFound: true });
    } catch (error) {
      this.logStorageFailure("remove", error);
      throw storageUnavailable();
    }
  }

  private bucket() {
    if (this.storage === undefined) this.initialize();
    if (!this.storage || !this.bucketName) {
      throw new ApiException(
        503,
        "AVATAR_STORAGE_UNAVAILABLE",
        "Profile photo storage is temporarily unavailable.",
        true,
      );
    }
    return this.storage.bucket(this.bucketName);
  }

  private initialize() {
    const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
    this.bucketName = process.env.FIREBASE_STORAGE_BUCKET?.trim() || null;
    if (!encoded || !this.bucketName) {
      this.storage = null;
      return;
    }
    try {
      const account = JSON.parse(
        Buffer.from(encoded, "base64").toString("utf8"),
      ) as ServiceAccount;
      const app = firebaseApp(account);
      this.storage = getStorage(app);
    } catch {
      this.storage = null;
      console.error(JSON.stringify({
        event: "firebase.storage_configuration_invalid",
        message: "Firebase Storage configuration could not be loaded.",
      }));
    }
  }

  private logStorageFailure(operation: string, error: unknown) {
    console.error(JSON.stringify({
      event: "firebase.avatar_storage_failed",
      operation,
      code:
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "unknown",
    }));
  }
}

function firebaseApp(account: ServiceAccount): App {
  const name = "bloom-profile-storage";
  return getApps().some((app) => app.name === name)
    ? getApp(name)
    : initializeApp({ credential: cert(account) }, name);
}

function invalidImage() {
  return new ApiException(
    400,
    "AVATAR_INVALID",
    "Choose a valid JPEG, PNG, or WebP image.",
  );
}

function storageUnavailable() {
  return new ApiException(
    503,
    "AVATAR_STORAGE_UNAVAILABLE",
    "Profile photo storage is temporarily unavailable.",
    true,
  );
}
