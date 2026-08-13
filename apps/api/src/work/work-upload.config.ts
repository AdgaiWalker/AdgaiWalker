import { DEFAULT_MAX_UPLOAD_BYTES, MAX_ORIGINAL_FILES } from '@walker/shared';

const configured = Number(process.env.WORK_MAX_UPLOAD_BYTES ?? DEFAULT_MAX_UPLOAD_BYTES);

export const WORK_UPLOAD_OPTIONS = {
  limits: {
    fileSize: Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_UPLOAD_BYTES,
    files: MAX_ORIGINAL_FILES,
  },
};
