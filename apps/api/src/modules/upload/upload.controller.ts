import {
  Controller,
  Delete,
  Body,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser, RequestUser } from "../../common/auth/current-user.decorator";
import { UploadService } from "./upload.service";

@Controller("upload")
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } }))
  async upload(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
    @Body("fileName") fileName?: string
  ) {
    return this.uploadService.uploadFile(file, user.organizationId, user.id, undefined, undefined, fileName);
  }

  @Get(":id/url")
  async getUrl(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string
  ) {
    return this.uploadService.getPresignedUrl(id, user.organizationId);
  }

  @Delete(":id")
  async delete(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string
  ) {
    return this.uploadService.deleteFile(id, user.organizationId);
  }
}
