import * as Joi from 'joi';

export const authEnvSchema = Joi.object({
  // Google OAuth
  GOOGLE_CLIENT_ID: Joi.string().required(),
  GOOGLE_CLIENT_SECRET: Joi.string().required(),
  GOOGLE_CALLBACK_URL: Joi.string().uri().required(),
  GOOGLE_ALLOWED_HD: Joi.string().required(),

  // OTP
  OTP_LENGTH: Joi.number().integer().min(4).max(8).default(6),
  OTP_TTL_SECONDS: Joi.number().integer().positive().default(300),
  OTP_MAX_REQUESTS_PER_WINDOW: Joi.number().integer().positive().default(3),
  OTP_WINDOW_SECONDS: Joi.number().integer().positive().default(600),

  // Throttler (global rate limit guard)
  THROTTLE_TTL: Joi.number().integer().positive().default(60),
  THROTTLE_LIMIT: Joi.number().integer().positive().default(20),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: Joi.string().required(),
  CLOUDINARY_API_KEY: Joi.string().required(),
  CLOUDINARY_API_SECRET: Joi.string().required(),
  UPLOAD_MAX_FILE_SIZE: Joi.number().integer().positive().default(5242880),

  // Resend
  RESEND_API_KEY: Joi.string().required(),
  RESEND_FROM_EMAIL: Joi.string().required(),
});
