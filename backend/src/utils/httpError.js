/** Error with an HTTP status; Express 5 forwards thrown/rejected errors to the error middleware. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
