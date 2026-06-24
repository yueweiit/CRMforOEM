import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { SseController } from "./sse.controller";
import { SseService } from "./sse.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [SseController],
  providers: [SseService],
  exports: [SseService]
})
export class SseModule {}
