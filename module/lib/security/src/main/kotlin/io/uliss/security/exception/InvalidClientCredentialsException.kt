package io.uliss.security.exception

import io.uliss.exception.common.InternalException

/** The authorization server rejected the mediator's own client credentials (401): a configuration error. */
class InvalidClientCredentialsException(
    message: String,
) : InternalException(message)
