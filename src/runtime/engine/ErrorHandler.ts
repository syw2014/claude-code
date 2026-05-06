// src/runtime/engine/ErrorHandler.ts

export type RetryStrategy = 'retry' | 'fallback' | 'terminate'

export interface ErrorContext {
  operation: string
  attempt: number
  maxAttempts: number
  error: Error
}

export interface ErrorHandlerConfig {
  maxAttempts?: number
  retryableErrors?: string[]
}

export class ErrorHandler {
  private config: Required<ErrorHandlerConfig>

  constructor(config: ErrorHandlerConfig = {}) {
    this.config = {
      maxAttempts: config.maxAttempts ?? 3,
      retryableErrors: config.retryableErrors ?? ['NetworkError', 'TimeoutError', 'RateLimitError'],
    }
  }

  decide(ctx: ErrorContext): RetryStrategy {
    if (ctx.attempt >= ctx.maxAttempts) return 'terminate'

    const isRetryable = this.config.retryableErrors.some(name =>
      ctx.error.name === name || ctx.error.message.includes(name)
    )

    if (isRetryable) return 'retry'
    return 'terminate'
  }

  get maxAttempts(): number {
    return this.config.maxAttempts
  }
}
