import { ErrorRequestHandler } from 'express'
import { logger } from '../logger.js'

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  logger.error({
    err,
    req: {
      method: req.method,
      url: req.url,
      body: req.body,
      headers: req.headers
    }
  }, 'Request error')

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  })
} 