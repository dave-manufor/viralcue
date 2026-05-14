import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err);

  // Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Invalid request data",
      details: err.errors,
      statusCode: 400,
    });
  }

  // Known API errors
  // Known API errors
  const statusCode = err.statusCode || 500;

  // Decide what to send to client
  // If it's a 5xx (internal/server error), hide the details
  const isServerError = statusCode >= 500;
  const message = isServerError
    ? "Internal Server Error"
    : err.message || "Unknown Error";
  const code = isServerError ? "INTERNAL_ERROR" : err.code || "API_ERROR";

  res.status(statusCode).json({
    error: code,
    message,
    statusCode,
  });
}

export class HttpError extends Error implements ApiError {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const NotFoundError = (resource: string) =>
  new HttpError(404, `${resource} not found`, "NOT_FOUND");

export const UnauthorizedError = () =>
  new HttpError(401, "Unauthorized", "UNAUTHORIZED");

export const ForbiddenError = () =>
  new HttpError(403, "Forbidden", "FORBIDDEN");

export const BadRequestError = (message: string) =>
  new HttpError(400, message, "BAD_REQUEST");
