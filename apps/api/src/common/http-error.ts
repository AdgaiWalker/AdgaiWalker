import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from '@walker/shared';

export class ApiError extends HttpException {
  constructor(code: ErrorCode | string, status: HttpStatus, message?: string) {
    super({ code, message: message ?? code }, status);
  }
}

export function storageUnavailable(): ApiError {
  return new ApiError('storage-unavailable', HttpStatus.SERVICE_UNAVAILABLE);
}

export function validationError(message: string): ApiError {
  return new ApiError('validation-error', HttpStatus.BAD_REQUEST, message);
}

export function missingClue(): ApiError {
  return new ApiError('missing-clue', HttpStatus.BAD_REQUEST);
}

export function guestQuotaExceeded(): ApiError {
  return new ApiError('guest-quota-exceeded', HttpStatus.UNAUTHORIZED);
}

export function rateLimited(): ApiError {
  return new ApiError('rate-limited', HttpStatus.TOO_MANY_REQUESTS);
}
