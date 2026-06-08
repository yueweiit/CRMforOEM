import { Body, Controller, Get, Post } from "@nestjs/common";
import { CurrentUser, RequestUser } from "../../common/auth/current-user.decorator";
import { Public } from "../../common/auth/public.decorator";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post("refresh")
  refresh(@Body("refreshToken") refreshToken: string) {
    return this.authService.refresh(refreshToken);
  }

  @Post("logout")
  logout(@CurrentUser() user: RequestUser) {
    return this.authService.logout(user);
  }

  @Get("me/permissions")
  mePermissions(@CurrentUser() user: RequestUser) {
    return this.authService.getMePermissions(user.id);
  }
}
