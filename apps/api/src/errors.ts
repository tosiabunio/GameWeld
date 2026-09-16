/** Errors that map to an HTTP status. Anything else is a 500. */
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, message, details);
export const notFound = (message = 'Not found') => new HttpError(404, message);
export const conflict = (message: string, details?: unknown) =>
  new HttpError(409, message, details);
