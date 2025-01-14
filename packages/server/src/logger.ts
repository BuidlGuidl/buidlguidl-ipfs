import pino from 'pino'

export const logger = pino.default({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
}) 