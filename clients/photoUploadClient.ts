import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { z } from "zod";

const cloudinaryEnvSchema = z.object({
  cloudName: z.string().min(1),
  apiKey: z.string().min(1),
  apiSecret: z.string().min(1),
  defaultFolder: z.string().min(1).optional(),
});

const s3EnvSchema = z.object({
  region: z.string().min(1),
  bucket: z.string().min(1),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  keyPrefix: z.string().optional(),
  publicUrlBase: z.string().url().optional(),
});

const photoUploadInputSchema = z.object({
  buffer: z
    .instanceof(Buffer)
    .refine((b) => b.length > 0, "buffer must not be empty"),
  filename: z.string().min(1).optional(),
  mimeType: z.string().min(1).optional(),
  folder: z.string().min(1).optional(),
  publicId: z.string().min(1).optional(),
});

export type PhotoUploadInput = z.input<typeof photoUploadInputSchema>;

export type PhotoUploadProvider = "cloudinary" | "s3";

export type PhotoUploadResult = {
  url: string;
  provider: PhotoUploadProvider;
  publicId?: string;
  key?: string;
  bytes: number;
};

export type PhotoUploadClientOptions = {
  cloudinary?: Partial<z.infer<typeof cloudinaryEnvSchema>>;
  s3?: Partial<z.infer<typeof s3EnvSchema>>;
};

type ParsedPhotoUpload = z.infer<typeof photoUploadInputSchema>;

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

function optionalErrorMessage(error: unknown): string | null {
  if (error instanceof Error) {
    return error.message;
  }
  if (error == null) {
    return null;
  }
  return String(error);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function extensionFromInput(filename?: string, mimeType?: string): string {
  if (filename) {
    const fromName = extname(filename).replace(/^\./, "").toLowerCase();
    if (fromName) {
      return fromName;
    }
  }
  if (mimeType) {
    const fromMime = MIME_TO_EXT[mimeType.toLowerCase()];
    if (fromMime) {
      return fromMime;
    }
  }
  return "jpg";
}

function resolveCloudinaryConfig(
  overrides: PhotoUploadClientOptions["cloudinary"],
): z.infer<typeof cloudinaryEnvSchema> | null {
  const parsed = cloudinaryEnvSchema.safeParse({
    cloudName: overrides?.cloudName ?? process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: overrides?.apiKey ?? process.env.CLOUDINARY_API_KEY,
    apiSecret: overrides?.apiSecret ?? process.env.CLOUDINARY_API_SECRET,
    defaultFolder: overrides?.defaultFolder ?? process.env.CLOUDINARY_FOLDER,
  });
  return parsed.success ? parsed.data : null;
}

function resolveS3Config(
  overrides: PhotoUploadClientOptions["s3"],
): z.infer<typeof s3EnvSchema> | null {
  const parsed = s3EnvSchema.safeParse({
    region:
      overrides?.region ?? process.env.AWS_REGION ?? process.env.AWS_S3_REGION,
    bucket: overrides?.bucket ?? process.env.AWS_S3_BUCKET,
    accessKeyId: overrides?.accessKeyId ?? process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey:
      overrides?.secretAccessKey ?? process.env.AWS_SECRET_ACCESS_KEY,
    keyPrefix: overrides?.keyPrefix ?? process.env.AWS_S3_KEY_PREFIX,
    publicUrlBase:
      overrides?.publicUrlBase ?? process.env.AWS_S3_PUBLIC_URL_BASE,
  });
  return parsed.success ? parsed.data : null;
}

function uploadBufferToCloudinary(
  buffer: Buffer,
  config: z.infer<typeof cloudinaryEnvSchema>,
  input: {
    folder?: string;
    publicId?: string;
  },
): Promise<UploadApiResponse> {
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  });

  const folder = input.folder ?? config.defaultFolder;

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "image",
        ...(folder ? { folder } : {}),
        ...(input.publicId ? { public_id: input.publicId } : {}),
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        if (!result?.secure_url) {
          reject(new Error("Cloudinary upload returned no secure_url"));
          return;
        }
        resolve(result);
      },
    );
    stream.end(buffer);
  });
}

function buildS3ObjectKey(
  config: z.infer<typeof s3EnvSchema>,
  input: { publicId?: string; filename?: string; mimeType?: string },
): string {
  const ext = extensionFromInput(input.filename, input.mimeType);
  const baseName = input.publicId?.replace(/[^\w.-]+/g, "-") ?? randomUUID();
  const fileName = `${baseName}.${ext}`;
  const prefix = config.keyPrefix?.replace(/^\/+|\/+$/g, "");
  return prefix ? `${prefix}/${fileName}` : fileName;
}

function buildS3PublicUrl(
  config: z.infer<typeof s3EnvSchema>,
  key: string,
): string {
  if (config.publicUrlBase) {
    return `${config.publicUrlBase.replace(/\/$/, "")}/${key}`;
  }
  return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
}

async function uploadBufferToS3(
  buffer: Buffer,
  config: z.infer<typeof s3EnvSchema>,
  input: {
    filename?: string;
    mimeType?: string;
    publicId?: string;
  },
): Promise<{ url: string; key: string }> {
  const client = new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  const key = buildS3ObjectKey(config, input);
  const contentType = input.mimeType ?? "application/octet-stream";

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );

  return { url: buildS3PublicUrl(config, key), key };
}

function buildCombinedUploadFailureError(
  cloudinaryError: unknown,
  s3Error: unknown,
): Error {
  const cloudinaryMessage = optionalErrorMessage(cloudinaryError);
  const s3Message = errorMessage(s3Error);
  if (cloudinaryMessage) {
    return new Error(
      `Photo upload failed (Cloudinary: ${cloudinaryMessage}; S3: ${s3Message})`,
    );
  }
  return new Error(`Photo upload failed (S3: ${s3Message})`);
}

async function tryCloudinaryUpload(
  parsed: ParsedPhotoUpload,
  config: z.infer<typeof cloudinaryEnvSchema>,
): Promise<PhotoUploadResult> {
  const result = await uploadBufferToCloudinary(parsed.buffer, config, {
    folder: parsed.folder,
    publicId: parsed.publicId,
  });
  return {
    url: result.secure_url,
    provider: "cloudinary",
    publicId: result.public_id,
    bytes: parsed.buffer.length,
  };
}

async function uploadViaS3(
  parsed: ParsedPhotoUpload,
  s3Config: z.infer<typeof s3EnvSchema>,
  cloudinaryError?: unknown,
): Promise<PhotoUploadResult> {
  try {
    const { url, key } = await uploadBufferToS3(parsed.buffer, s3Config, {
      filename: parsed.filename,
      mimeType: parsed.mimeType,
      publicId: parsed.publicId,
    });
    return {
      url,
      provider: "s3",
      key,
      bytes: parsed.buffer.length,
    };
  } catch (s3Error) {
    if (cloudinaryError !== undefined) {
      throw buildCombinedUploadFailureError(cloudinaryError, s3Error);
    }
    throw s3Error;
  }
}

async function uploadPhotoWithProviders(
  parsed: ParsedPhotoUpload,
  cloudinaryConfig: z.infer<typeof cloudinaryEnvSchema> | null,
  s3Config: z.infer<typeof s3EnvSchema> | null,
): Promise<PhotoUploadResult> {
  if (!cloudinaryConfig && !s3Config) {
    throw new Error(
      "Photo upload is not configured: set Cloudinary (CLOUDINARY_*) and/or S3 (AWS_*) environment variables",
    );
  }

  if (cloudinaryConfig) {
    try {
      return await tryCloudinaryUpload(parsed, cloudinaryConfig);
    } catch (error) {
      if (!s3Config) {
        throw error;
      }
      return uploadViaS3(parsed, s3Config, error);
    }
  }

  if (!s3Config) {
    throw new Error(
      "Photo upload is not configured: set Cloudinary (CLOUDINARY_*) and/or S3 (AWS_*) environment variables",
    );
  }
  return uploadViaS3(parsed, s3Config);
}

export function createPhotoUploadClient(
  options: PhotoUploadClientOptions = {},
) {
  return {
    /**
     * Upload image bytes to Cloudinary when configured; on failure (or missing
     * Cloudinary config), falls back to S3 when configured.
     */
    async uploadPhoto(input: PhotoUploadInput): Promise<PhotoUploadResult> {
      const parsed = photoUploadInputSchema.parse(input);
      return uploadPhotoWithProviders(
        parsed,
        resolveCloudinaryConfig(options.cloudinary),
        resolveS3Config(options.s3),
      );
    },
  };
}

export const photoUploadClient = createPhotoUploadClient();
