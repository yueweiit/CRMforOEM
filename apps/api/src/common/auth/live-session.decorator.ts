import { SetMetadata } from "@nestjs/common";

export const REQUIRE_LIVE_SESSION_KEY = "require-live-session";
export const RequireLiveSession = () => SetMetadata(REQUIRE_LIVE_SESSION_KEY, true);
