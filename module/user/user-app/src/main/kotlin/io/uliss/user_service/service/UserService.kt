package io.uliss.user_service.service

import io.grpc.Status
import io.grpc.StatusRuntimeException
import io.grpc.stub.StreamObserver
import io.uliss.api.user.v1.DisplayNameRequest
import io.uliss.api.user.v1.DisplayNameResponse
import io.uliss.api.user.v1.UserServiceGrpc
import io.uliss.logging.logger.AppLogger
import io.uliss.user_service.repository.UserRepository
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class UserService(
    private val userRepository: UserRepository
) : UserServiceGrpc.UserServiceImplBase() {
    private val log = AppLogger.of(UserService::class)

    override fun getDisplayName(
        request: DisplayNameRequest,
        responseObserver: StreamObserver<DisplayNameResponse>
    ) {
        try {
            val userEntity = userRepository.findByAuthId(UUID.fromString(request.authId))
                ?: throw StatusRuntimeException(Status.NOT_FOUND.withDescription("user not found"))

            val response = DisplayNameResponse.newBuilder()
                .setDisplayName(userEntity.displayName)
                .build()

            responseObserver.onNext(response)
            responseObserver.onCompleted()
        } catch (ex: Exception) {
            log.error("internal error", "getDisplayName", ex)
            responseObserver.onError(
                Status.INTERNAL.withDescription("internal error").withCause(ex).asRuntimeException()
            )
        }
    }
}