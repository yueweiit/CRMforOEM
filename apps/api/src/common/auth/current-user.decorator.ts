import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export type RequestUser = {
  id: string;
  organizationId: string;
  name?: string;
  email?: string;
  teamId?: string;
  roleCodes: string[];
  permissions: string[];
  dataScope: "SELF" | "TEAM" | "ALL";
  sessionId?: string;
  permissionVersion?: number;
  tokenType?: "access" | "refresh";
};

export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext): RequestUser => {
  const request = context.switchToHttp().getRequest();
  return request.user;
});
