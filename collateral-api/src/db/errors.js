class DomainError extends Error {
  constructor(message, details) {
    super(message);
    this.details = details ?? null;
  }
}

class NotFoundError extends DomainError {
  constructor(message = 'Not found', details) {
    super(message, details);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

class ConflictError extends DomainError {
  constructor(message = 'Conflict', details) {
    super(message, details);
    this.name = 'ConflictError';
    this.statusCode = 409;
  }
}

class ForbiddenError extends DomainError {
  constructor(message = 'Forbidden', details) {
    super(message, details);
    this.name = 'ForbiddenError';
    this.statusCode = 403;
  }
}

module.exports = { DomainError, NotFoundError, ConflictError, ForbiddenError };
