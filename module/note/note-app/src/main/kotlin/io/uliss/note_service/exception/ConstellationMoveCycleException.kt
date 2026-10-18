package io.uliss.note_service.exception

import io.uliss.exception.common.ServerException
import org.springframework.http.HttpStatus
import java.util.UUID

class ConstellationMoveCycleException(id: UUID, parentId: UUID) : ServerException(
    message = "constellation id=$id cannot move into its own branch (parent id=$parentId)",
    httpStatus = HttpStatus.CONFLICT,
    code = "CONSTELLATION_MOVE_CYCLE",
)
