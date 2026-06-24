import { Injectable } from "@nestjs/common";
import type { ManagedConnection } from "./types";

@Injectable()
export class ImapConnectionRegistryService {
  private connections = new Map<string, ManagedConnection>();

  get(accountId: string) {
    return this.connections.get(accountId);
  }

  set(accountId: string, conn: ManagedConnection) {
    this.connections.set(accountId, conn);
  }

  delete(accountId: string) {
    return this.connections.delete(accountId);
  }

  has(accountId: string) {
    return this.connections.has(accountId);
  }

  getAllIds() {
    return Array.from(this.connections.keys());
  }
}
