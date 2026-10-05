// Engine error type with stable machine-readable codes.
// The UI maps codes to friendly messages; never expose stack traces to users.

export class EngineError extends Error {
  /**
   * @param {string} code stable error code, e.g. 'VOTE_DUPLICATE'
   * @param {string} message human-readable explanation (safe to display)
   */
  constructor(code, message) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
  }
}

export function isEngineError(err) {
  return err instanceof EngineError || (err && err.name === 'EngineError' && typeof err.code === 'string');
}

/** Thrown by buildWordDatabase for malformed word data (programmer error). */
export class WordsDataError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WordsDataError';
  }
}
