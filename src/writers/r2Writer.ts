import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { AppConfig } from "../config";

const MAX_MIRRORED_IMAGE_BYTES = 10 * 1024 * 1024;

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

const isUnsafeImageUrl = (rawUrl: string) => {
	try {
		const url = new URL(rawUrl);
		if (url.protocol !== "http:" && url.protocol !== "https:") return true;

		const hostname = url.hostname.toLowerCase();
		if (
			hostname === "localhost" ||
			hostname.endsWith(".localhost") ||
			hostname.endsWith(".local") ||
			hostname.endsWith(".internal") ||
			hostname === "0.0.0.0" ||
			hostname === "::1" ||
			hostname === "[::1]"
		) return true;

		const octets = hostname.split(".").map(Number);
		if (octets.length === 4 && octets.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
			const [first, second] = octets;
			if (
				first === 10 ||
				first === 127 ||
				(first === 169 && second === 254) ||
				(first === 172 && second >= 16 && second <= 31) ||
				(first === 192 && second === 168)
			) return true;
		}

		return false;
	} catch {
		return true;
	}
};

const readImageBody = async (response: Response): Promise<ArrayBuffer | null> => {
	const contentLength = Number(response.headers.get("content-length") ?? "");
	if (Number.isFinite(contentLength) && contentLength > MAX_MIRRORED_IMAGE_BYTES) {
		return null;
	}

	if (!response.body) {
		const buffer = await response.arrayBuffer();
		return buffer.byteLength <= MAX_MIRRORED_IMAGE_BYTES ? buffer : null;
	}

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;
			totalBytes += value.byteLength;
			if (totalBytes > MAX_MIRRORED_IMAGE_BYTES) {
				await reader.cancel();
				return null;
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	const buffer = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		buffer.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return buffer.buffer;
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

		if (this.bucketBinding != null) {
			this.enabled = true;
			this.client = null;
			return;
		}

		this.enabled = Boolean(
			this.appConfig.r2AccountId &&
				this.appConfig.r2AccessKeyId &&
				this.appConfig.r2SecretAccessKey &&
				this.appConfig.r2Bucket,
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
		if (isUnsafeImageUrl(imageUrl)) {
			return { url: imageUrl, key: null };
		}

		const response = await fetch(imageUrl, {
			signal: AbortSignal.timeout(this.appConfig.requestTimeoutMs),
		});
		if (!response.ok) {
			return { url: imageUrl, key: null };
		}

		const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
		if (!contentType?.startsWith("image/")) {
			return { url: imageUrl, key: null };
		}

		const buffer = await readImageBody(response);
		if (!buffer) {
			return { url: imageUrl, key: null };
		}
		const originalFilename = imageUrl.split("/").pop() || "image.webp";
		const objectKey = buildObjectKey(prefix, originalFilename);

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
		return {
			url: base ? `${base}/${objectKey}` : imageUrl,
			key: objectKey,
		};
	}
}
