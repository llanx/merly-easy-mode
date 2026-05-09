export class MerlyAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = "MerlyAuthError";
  }
}

export class MerlyHttpError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "MerlyHttpError";
    this.details = details;
  }
}
