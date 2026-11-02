/** A commit refused because a file is too large for an agent to read whole; the message says how to split it. */
export class FileSizeError extends Error {
  readonly status = 422;
}

/** A push that waits for a person's yes (428), or that the project's settings refuse (403). */
export class PushError extends Error {
  constructor(
    message: string,
    readonly status: 403 | 428,
  ) {
    super(message);
  }
}
