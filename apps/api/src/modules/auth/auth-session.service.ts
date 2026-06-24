import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OnEvent } from "@nestjs/event-emitter";
import Redis from "ioredis";
import { REDIS_CLIENT } from "../../infrastructure/redis/redis.module";

type AuthSessionPayload = {
  userId: string;
  organizationId: string;
  isActive: boolean;
  permissionVersion: number;
  refreshTokenHash?: string;
  createdAt: string;
  lastSeenAt: string;
};

@Injectable()
export class AuthSessionService {
  private readonly refreshTtlSeconds: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService
  ) {
    this.refreshTtlSeconds = this.parseSeconds(this.config.get<string>("JWT_REFRESH_EXPIRES_IN", "7d"));
  }

  async createSession(input: {
    sessionId: string;
    userId: string;
    organizationId: string;
    permissionVersion: number;
    refreshTokenHash?: string;
    ttlSeconds: number;
  }) {
    const now = new Date().toISOString();
    const session: AuthSessionPayload = {
      userId: input.userId,
      organizationId: input.organizationId,
      isActive: true,
      permissionVersion: input.permissionVersion,
      refreshTokenHash: input.refreshTokenHash,
      createdAt: now,
      lastSeenAt: now
    };

    await this.redis
      .multi()
      .set(this.sessionKey(input.sessionId), JSON.stringify(session), "EX", input.ttlSeconds)
      .sadd(this.userSessionsKey(input.userId), input.sessionId)
      .set(this.permissionVersionKey(input.userId), String(input.permissionVersion), "EX", input.ttlSeconds)
      .exec();
  }

  async validateSession(input: {
    sessionId?: string;
    userId: string;
    organizationId: string;
    permissionVersion?: number;
  }): Promise<AuthSessionPayload> {
    if (!input.sessionId) {
      throw new UnauthorizedException("Session expired");
    }

    let raw: string | null;
    try {
      raw = await this.redis.get(this.sessionKey(input.sessionId));
    } catch {
      throw new UnauthorizedException("Session service unavailable");
    }

    if (!raw) {
      throw new UnauthorizedException("Session expired");
    }

    const session = JSON.parse(raw) as AuthSessionPayload;
    if (!session.isActive || session.userId !== input.userId || session.organizationId !== input.organizationId) {
      throw new UnauthorizedException("Invalid session");
    }

    if (input.permissionVersion !== undefined) {
      const currentVersion = await this.getRequiredPermissionVersion(input.userId);
      if (input.permissionVersion !== currentVersion) {
        throw new UnauthorizedException("Permissions changed, please refresh or login again");
      }
    }

    await this.touchSession(input.sessionId).catch(() => {});
    return session;
  }

  async getSession(sessionId: string): Promise<AuthSessionPayload | null> {
    try {
      const raw = await this.redis.get(this.sessionKey(sessionId));
      return raw ? (JSON.parse(raw) as AuthSessionPayload) : null;
    } catch {
      return null;
    }
  }

  async getRequiredPermissionVersion(userId: string, ttlSeconds?: number): Promise<number> {
    const key = this.permissionVersionKey(userId);
    let raw: string | null;
    try {
      raw = await this.redis.get(key);
    } catch {
      throw new UnauthorizedException("Session service unavailable");
    }

    if (raw === null) {
      throw new UnauthorizedException("Session expired, please login again");
    }

    const version = Number(raw);
    if (!Number.isInteger(version) || version <= 0) {
      throw new UnauthorizedException("Session expired, please login again");
    }

    await this.redis.expire(key, ttlSeconds ?? this.refreshTtlSeconds);
    return version;
  }

  async getOrInitializePermissionVersion(userId: string, ttlSeconds?: number): Promise<number> {
    const key = this.permissionVersionKey(userId);
    let raw: string | null;
    try {
      raw = await this.redis.get(key);
    } catch {
      throw new UnauthorizedException("Session service unavailable");
    }

    if (raw !== null) {
      const version = Number(raw);
      if (!Number.isInteger(version) || version <= 0) {
        throw new UnauthorizedException("Session service unavailable");
      }
      await this.redis.expire(key, ttlSeconds ?? this.refreshTtlSeconds);
      return version;
    }

    const initialVersion = 1;
    await this.redis.set(key, String(initialVersion), "EX", ttlSeconds ?? this.refreshTtlSeconds);
    return initialVersion;
  }

  async touchSession(sessionId: string) {
    const key = this.sessionKey(sessionId);
    const raw = await this.redis.get(key);
    if (!raw) return;
    const session = JSON.parse(raw) as AuthSessionPayload;
    session.lastSeenAt = new Date().toISOString();
    const ttl = await this.redis.pttl(key);
    if (ttl > 0) {
      await this.redis.set(key, JSON.stringify(session), "PX", ttl);
    } else {
      await this.redis.set(key, JSON.stringify(session));
    }
  }

  async revokeSession(sessionId: string) {
    const raw = await this.redis.get(this.sessionKey(sessionId));
    if (raw) {
      const session = JSON.parse(raw) as AuthSessionPayload;
      await this.redis
        .multi()
        .del(this.sessionKey(sessionId))
        .srem(this.userSessionsKey(session.userId), sessionId)
        .exec();
    }
  }

  async revokeUserSessions(userId: string) {
    const sessionIds = await this.redis.smembers(this.userSessionsKey(userId));
    if (!sessionIds.length) return;
    const multi = this.redis.multi();
    for (const sessionId of sessionIds) {
      multi.del(this.sessionKey(sessionId));
    }
    multi.del(this.userSessionsKey(userId));
    await multi.exec();
  }

  async bumpUserPermissionVersion(userId: string, ttlSeconds?: number): Promise<number> {
    const key = this.permissionVersionKey(userId);
    const newVersion = await this.redis.incr(key);
    await this.redis.expire(key, ttlSeconds ?? this.refreshTtlSeconds);
    return newVersion;
  }

  // ── Event listeners (Phase 3) ──

  @OnEvent("auth.permission.changed")
  async handlePermissionChanged(event: {
    affectedDirectUserIds: string[];
    affectedInheritedUserIds: string[];
  }) {
    const affectedUserIds = new Set([
      ...(event.affectedDirectUserIds ?? []),
      ...(event.affectedInheritedUserIds ?? [])
    ]);

    for (const userId of affectedUserIds) {
      await this.bumpUserPermissionVersion(userId);
    }
  }

  @OnEvent("auth.user.disabled")
  async handleUserDisabled(event: { userId: string }) {
    await this.revokeUserSessions(event.userId);
  }

  @OnEvent("auth.user.roles_changed")
  async handleUserRolesChanged(event: { userId: string }) {
    await this.bumpUserPermissionVersion(event.userId);
  }

  // ── Helpers ──

  private parseSeconds(value: string): number {
    const match = value.match(/^(\d+)\s*(s|m|h|d)$/);
    if (!match) return 7 * 24 * 60 * 60;
    const num = Number(match[1]);
    switch (match[2]) {
      case "s": return num;
      case "m": return num * 60;
      case "h": return num * 60 * 60;
      case "d": return num * 24 * 60 * 60;
      default: return num;
    }
  }

  // ── Key helpers ──

  private sessionKey(sessionId: string) {
    return `auth:session:${sessionId}`;
  }

  private userSessionsKey(userId: string) {
    return `auth:user:${userId}:sessions`;
  }

  private permissionVersionKey(userId: string) {
    return `auth:user:${userId}:permissionVersion`;
  }
}
