import { Controller, Get, Query, Req, UnauthorizedException, Sse } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { Observable } from "rxjs";
import { Public } from "../auth/public.decorator";
import { SseService } from "./sse.service";

@Controller()
export class SseController {
  constructor(
    private readonly sseService: SseService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  @Public()
  @Sse("events")
  events(@Query("token") token: string, @Req() req: Request): Observable<MessageEvent> {
    if (!token) {
      throw new UnauthorizedException("Token query parameter is required for SSE");
    }

    let payload: { sub: string; organizationId: string };
    try {
      payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>("JWT_ACCESS_SECRET")
      });
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }

    const { id, subject } = this.sseService.createConnection(payload.sub, payload.organizationId);

    req.on("close", () => {
      this.sseService.removeConnection(id);
    });

    return subject.asObservable();
  }
}
