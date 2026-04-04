import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { AppConfig } from "../config";

export type R2BucketLike = {
	put: (
		key: string,
		value: ArrayBuffer | Uint8Array,
		options?: { httpMetadata?: { contentType?: string } },
	) => Promise<unknown>;
};

const sanitizeFileName = (raw: string) => {
	return raw
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
};

const buildObjectKey = (prefix: string, filename: string) => {
	const safePrefix = prefix.trim().replace(/^\/+|\/+$/g, "");
	const safeFilename = sanitizeFileName(filename);

	return safePrefix ? `${safePrefix}/${safeFilename}` : safeFilename;
};

export class R2Writer {
	private readonly enabled: boolean;
	private readonly client: S3Client | null;
	private readonly bucketBinding: R2BucketLike | null;

	constructor(
		private readonly appConfig: AppConfig,
		bucketBinding?: R2BucketLike | null,
	) {
		this.bucketBinding = bucketBinding ?? null;

		if (this.bucketBinding != null && this.appConfig.r2PublicBaseUrl) {
			this.enabled = true;
			this.client = null;
			return;
		}

		this.enabled = Boolean(
			this.appConfig.r2AccountId &&
				this.appConfig.r2AccessKeyId &&
				this.appConfig.r2SecretAccessKey &&
				this.appConfig.r2Bucket &&
				this.appConfig.r2PublicBaseUrl,
		);

		if (!this.enabled) {
			this.client = null;
			return;
		}

		this.client = new S3Client({
			region: "auto",
			endpoint: `https://${this.appConfig.r2AccountId}.r2.cloudflarestorage.com`,
			credentials: {
				accessKeyId: this.appConfig.r2AccessKeyId,
				secretAccessKey: this.appConfig.r2SecretAccessKey,
			},
		});
	}

	isEnabled() {
		return this.enabled;
	}

	async mirrorFromUrl(
		imageUrl: string,
		prefix = "animes",
	): Promise<{ url: string; key: string | null }> {
		if (!this.isEnabled()) {
			return { url: imageUrl, key: null };
		}

		const response = await fetch(imageUrl, {
			signal: AbortSignal.timeout(this.appConfig.requestTimeoutMs),
		});
		if (!response.ok) {
			return { url: imageUrl, key: null };
		}

		const buffer = await response.arrayBuffer();
		const originalFilename = imageUrl.split("/").pop() || "image.webp";
		const objectKey = buildObjectKey(prefix, originalFilename);
		const contentType = response.headers.get("content-type") || "image/webp";

		if (this.bucketBinding != null) {
			await this.bucketBinding.put(objectKey, buffer, {
				httpMetadata: { contentType },
			});
		} else {
			await this.client?.send(
				new PutObjectCommand({
					Bucket: this.appConfig.r2Bucket,
					Key: objectKey,
					Body: new Uint8Array(buffer),
					ContentType: contentType,
				}),
			);
		}

		const base = this.appConfig.r2PublicBaseUrl.replace(/\/+$/, "");
		return { url: `${base}/${objectKey}`, key: objectKey };
	}
}
