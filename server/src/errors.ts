/** Typed store/API errors. `status` is the HTTP status the API maps them to. */

export type StoreErrorCode =
  | "unparseable_file"
  | "invalid_file"
  | "newer_schema"
  | "not_found"
  | "bad_request"
  | "stale"
  | "invalid_update";

const STATUS: Record<StoreErrorCode, number> = {
  unparseable_file: 422,
  invalid_file: 422,
  newer_schema: 422,
  not_found: 404,
  bad_request: 400,
  stale: 412,
  invalid_update: 422,
};

export class StoreError extends Error {
  override name = "StoreError";
  readonly status: number;
  constructor(
    readonly code: StoreErrorCode,
    message: string,
    readonly file?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.status = STATUS[code];
  }
}

export interface Warning {
  file: string;
  code: string;
  message: string;
}
