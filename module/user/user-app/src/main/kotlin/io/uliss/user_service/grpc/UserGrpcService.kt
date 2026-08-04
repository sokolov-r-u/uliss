package io.uliss.user_service.grpc

import io.grpc.Status
import io.grpc.stub.StreamObserver
import io.uliss.api.user.v1.UserInfoRequest
import io.uliss.api.user.v1.UserInfoResponse
import io.uliss.api.user.v1.UserServiceGrpc
import io.uliss.logging.logger.AppLogger
import io.uliss.user_service.service.UserProfileService
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class UserGrpcService(
    private val userProfileService: UserProfileService,
) : UserServiceGrpc.UserServiceImplBase() {

    private val log = AppLogger.of(UserGrpcService::class)

    override fun getUserInfo(
        request: UserInfoRequest,
        responseObserver: StreamObserver<UserInfoResponse>
    ) {
        try {
            val authId = UUID.fromString(request.authId)
            val user = userProfileService.getOrCreate(authId)

            val response = UserInfoResponse.newBuilder()
                .setUserId(user.id.toString())
                .apply { user.displayName?.let { setDisplayName(it) } }
                .build()

            responseObserver.onNext(response)
            responseObserver.onCompleted()
        } catch (ex: IllegalArgumentException) {
            log.error("invalid authId=${request.authId}", "getUserInfo", ex)
            responseObserver.onError(
                Status.INVALID_ARGUMENT.withDescription("invalid authId").withCause(ex).asRuntimeException()
            )
        } catch (ex: Exception) {
            log.error("internal error", "getUserInfo", ex)
            responseObserver.onError(
                Status.INTERNAL.withDescription("internal error").withCause(ex).asRuntimeException()
            )
        }
    }
}
