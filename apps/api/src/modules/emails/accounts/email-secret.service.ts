import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

@Injectable()
export class EmailSecretService {
  constructor(private readonly config: ConfigService) {}

  encrypt(value: string) {
    const iv = randomBytes(12);
    const key = this.key();
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      keyVersion: "v1",
      value: Buffer.concat([iv, tag, encrypted]).toString("base64")
    };
  }

  decrypt(value: string) {
    const raw = Buffer.from(value, "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  }

  private key() {
    const seed = this.config.get<string>("JWT_ACCESS_SECRET", "development-only-secret");
    return createHash("sha256").update(seed).digest();
  }
}

