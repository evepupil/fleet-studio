export const ERROR_CODES = [
  "invalid_request",
  "not_found",
  "conflict",
  "unauthorized",
  "forbidden_origin",
  "illegal_transition",
  "config_invalid",
  "runtime_unavailable",
  "internal",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** 全项目统一的错误类型。message 用中文写给人看。 */
export class FleetError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "FleetError";
    this.code = code;
  }
}

export function isFleetError(value: unknown): value is FleetError {
  return value instanceof FleetError;
}
