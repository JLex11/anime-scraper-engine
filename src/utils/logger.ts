type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_WEIGHT: Record<LogLevel, number> = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40,
}

export class Logger {
	constructor(private readonly minLevel: LogLevel = 'info') {}

	private shouldLog(level: LogLevel) {
		return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[this.minLevel]
	}

	private print(level: LogLevel, message: string, meta?: unknown) {
		if (!this.shouldLog(level)) return
		const payload = meta == null ? '' : ` ${JSON.stringify(meta)}`
		// Keep logs one-line to simplify ingestion by worker platforms.
		console.log(`[${new Date().toISOString()}] ${level.toUpperCase()} ${message}${payload}`)
	}

	debug(message: string, meta?: unknown) {
		this.print('debug', message, meta)
	}

	info(message: string, meta?: unknown) {
		this.print('info', message, meta)
	}

	warn(message: string, meta?: unknown) {
		this.print('warn', message, meta)
	}

	error(message: string, meta?: unknown) {
		this.print('error', message, meta)
	}
}
