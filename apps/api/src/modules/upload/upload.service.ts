import { Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

@Injectable()
export class UploadService implements OnModuleInit {
  private readonly logger = new Logger(UploadService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {
    this.s3 = new S3Client({
      endpoint: config.getOrThrow<string>("S3_ENDPOINT"),
      region: config.getOrThrow<string>("S3_REGION"),
      credentials: {
        accessKeyId: config.getOrThrow<string>("S3_ACCESS_KEY"),
        secretAccessKey: config.getOrThrow<string>("S3_SECRET_KEY")
      },
      forcePathStyle: true
    });
    this.bucket = config.getOrThrow<string>("S3_BUCKET");
  }

  async onModuleInit() {
    await this.ensureBucket();
  }

  private async ensureBucket() {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Bucket "${this.bucket}" already exists`);
    } catch (err: unknown) {
      const code = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (code === 404 || (err as Error).name === "NotFound") {
        this.logger.log(`Bucket "${this.bucket}" not found, creating...`);
        await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Bucket "${this.bucket}" created`);
      } else {
        this.logger.warn(`Could not verify bucket "${this.bucket}": ${(err as Error).message}`);
      }
    }
  }

  async uploadFile(
    file: Express.Multer.File,
    organizationId: string,
    createdById: string,
    entityType?: string,
    entityId?: string
  ) {
    const objectKey = `${organizationId}/${Date.now()}_${file.originalname}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentLength: file.size
      })
    );

    const record = await this.prisma.fileAsset.create({
      data: {
        organizationId,
        storageDriver: "s3",
        bucket: this.bucket,
        objectKey,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        entityType: entityType ?? null,
        entityId: entityId ?? null,
        createdById
      }
    });

    this.logger.log(`Uploaded ${file.originalname} -> ${record.id}`);
    return record;
  }

  async getPresignedUrl(id: string, organizationId: string) {
    const record = await this.prisma.fileAsset.findFirst({
      where: { id, organizationId }
    });
    if (!record) {
      throw new NotFoundException("File not found");
    }
    const url = await getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.bucket, Key: record.objectKey }),
      { expiresIn: 3600 }
    );
    return { id: record.id, url, originalName: record.originalName, mimeType: record.mimeType };
  }

  async deleteFile(id: string, organizationId: string) {
    const record = await this.prisma.fileAsset.findFirst({
      where: { id, organizationId }
    });
    if (!record) {
      throw new NotFoundException("File not found");
    }

    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: record.objectKey
      })
    );

    if (record.thumbnailKey) {
      try {
        await this.s3.send(
          new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: record.thumbnailKey
          })
        );
      } catch (err) {
        this.logger.warn(`Failed to delete thumbnail: ${record.thumbnailKey}`);
      }
    }

    await this.prisma.fileAsset.delete({ where: { id } });
    this.logger.log(`Deleted file ${id} (${record.originalName})`);

    return { deleted: true };
  }
}
