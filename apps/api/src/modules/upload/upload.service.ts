import { ConflictException, Injectable, Logger, NotFoundException, OnModuleInit, PayloadTooLargeException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { repairMojibakeFileName, resolveUploadFileName } from "./upload-file-name";

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
    entityId?: string,
    clientFileName?: string
  ) {
    const originalName = resolveUploadFileName(clientFileName, file.originalname);
    const objectKey = `${organizationId}/${Date.now()}_${originalName}`;

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
        originalName,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        entityType: entityType ?? null,
        entityId: entityId ?? null,
        createdById
      }
    });

    this.logger.log(`Uploaded ${originalName} -> ${record.id}`);
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
    return { id: record.id, url, originalName: repairMojibakeFileName(record.originalName), mimeType: record.mimeType };
  }

  async readFile(id: string, organizationId: string, maxBytes: number) {
    const record = await this.prisma.fileAsset.findFirst({
      where: { id, organizationId }
    });
    if (!record) {
      throw new NotFoundException("File not found");
    }
    if (record.sizeBytes !== null && record.sizeBytes > maxBytes) {
      throw new PayloadTooLargeException("File exceeds the allowed email attachment size");
    }

    const result = await this.s3.send(
      new GetObjectCommand({ Bucket: record.bucket ?? this.bucket, Key: record.objectKey })
    );
    if (!result.Body) {
      throw new NotFoundException("Stored file content not found");
    }
    const content = Buffer.from(await result.Body.transformToByteArray());
    if (content.byteLength > maxBytes) {
      throw new PayloadTooLargeException("File exceeds the allowed email attachment size");
    }
    return { record, content };
  }

  async deleteFile(id: string, organizationId: string) {
    const record = await this.prisma.fileAsset.findFirst({
      where: { id, organizationId }
    });
    if (!record) {
      throw new NotFoundException("File not found");
    }
    const [draftReference, messageReference] = await Promise.all([
      this.prisma.emailDraftAttachment.findFirst({ where: { fileAssetId: id }, select: { id: true } }),
      this.prisma.emailAttachment.findFirst({ where: { fileAssetId: id }, select: { id: true } })
    ]);
    if (draftReference || messageReference) {
      throw new ConflictException("File is referenced by an email and cannot be deleted");
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
