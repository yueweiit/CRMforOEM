import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { SettingsModule } from "../settings/settings.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthSessionService } from "./auth-session.service";

@Module({
  imports: [JwtModule.register({}), SettingsModule],
  controllers: [AuthController],
  providers: [AuthService, AuthSessionService],
  exports: [AuthService, AuthSessionService, JwtModule]
})
export class AuthModule {}
