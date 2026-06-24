import { Injectable } from "@nestjs/common";

@Injectable()
export class ImapReconnectService {
  reconnectDelay(retryCount: number) {
    const fastDelays = [1_000, 3_000, 5_000, 10_000];
    return fastDelays[retryCount] ?? Math.min(30_000 + retryCount * 5_000, 60_000);
  }

  isAuthFailure(error: unknown) {
    const message = this.formatError(error).toLowerCase();
    return message.includes("authentication")
      || message.includes("invalid credentials")
      || message.includes("login failed")
      || message.includes("auth failed");
  }

  formatError(error: unknown) {
    return error instanceof Error ? error.message : "Unknown error";
  }
}
