import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { config } from '../config'

const sanitizeFileName = (raw: string) => {
	return raw
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')
}

const buildObjectKey = (prefix: string, filename: string) => {
	const safePrefix = prefix.trim().replace(/^\/+|\/+$/g, '')
	const safeFilename = sanitizeFileName(filename)

	return safePrefix ? `${safePrefix}/${safeFilename}` : safeFilename
}

export class R2Writer {
	private readonly enabled: boolean
	private readonly client: S3Client | null

	constructor() {
		this.enabled = Boolean(
			config.r2AccountId &&
				config.r2AccessKeyId &&
				config.r2SecretAccessKey &&
				config.r2Bucket &&
				config.r2PublicBaseUrl
		)

		if (!this.enabled) {
			this.client = null
			return
		}

		this.client = new S3Client({
			region: 'auto',
			endpoint: `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
			credentials: {
				accessKeyId: config.r2AccessKeyId,
				secretAccessKey: config.r2SecretAccessKey,
			},
		})
	}

	isEnabled() {
		return this.enabled && this.client != null
	}

	async mirrorFromUrl(imageUrl: string, prefix = 'animes'): Promise<{ url: string; key: string | null }> {
		if (!this.isEnabled()) {
			return { url: imageUrl, key: null }
		}

		const response = await fetch(imageUrl, { signal: AbortSignal.timeout(config.requestTimeoutMs) })
		if (!response.ok) {
			return { url: imageUrl, key: null }
		}

		const buffer = await response.arrayBuffer()
		const originalFilename = imageUrl.split('/').pop() || 'image.webp'
		const objectKey = buildObjectKey(prefix, originalFilename)

		await this.client?.send(new PutObjectCommand({
			Bucket: config.r2Bucket,
			Key: objectKey,
			Body: new Uint8Array(buffer),
			ContentType: response.headers.get('content-type') || 'image/webp',
		}))

		const base = config.r2PublicBaseUrl.replace(/\/+$/, '')
		return { url: `${base}/${objectKey}`, key: objectKey }
	}
}
