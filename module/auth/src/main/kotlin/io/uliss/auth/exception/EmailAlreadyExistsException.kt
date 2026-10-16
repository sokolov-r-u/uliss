package io.uliss.auth.exception

import io.uliss.exception.common.AlreadyExistsException

class EmailAlreadyExistsException() : AlreadyExistsException("user email already exists") {
}