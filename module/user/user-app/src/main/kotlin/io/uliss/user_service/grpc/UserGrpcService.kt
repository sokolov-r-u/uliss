package io.uliss.user_service.grpc

import io.grpc.Status
import io.grpc.stub.StreamObserver
import io.uliss.api.user.v1.UserInfoRequest
import io.uliss.api.user.v1.UserInfoResponse
import io.uliss.api.user.v1.UserServiceGrpc
import io.uliss.logging.logger.AppLogger
import io.uliss.user_service.service.MessageService
import io.uliss.user_service.service.UserProfileService
import org.springframework.dao.DataAccessResourceFailureException
import org.springframework.dao.TransientDataAccessException
import org.springframework.stereotype.Component
import java.util.UUID

// @Component, not @Service: call tracing proxies services, and the stub's final bindService cannot be proxied
@Component
class UserGrpcService(
    private val userProfileService: UserProfileService,
    private val messageService: MessageService,
) : UserServiceGrpc.UserServiceImplBase() {

    private val log = AppLogger.of(UserGrpcService::class)

    override fun getUserInfo(
        request: UserInfoRequest,
        responseObserver: StreamObserver<UserInfoResponse>
    ) {
        val authId = runCatching { UUID.fromString(request.authId) }.getOrNull()
        if (authId == null) {
            log.warn("invalid authId={}", "getUserInfo", request.authId)
            responseObserver.onError(Status.INVALID_ARGUMENT.withDescription("invalid authId").asRuntimeException())
            return
        }
        try {
            val user = userProfileService.getOrCreate(authId)

            val response = UserInfoResponse.newBuilder()
                .setUserId(user.id.toString())
                .apply { user.displayName?.let { setDisplayName(it) } }
                .setOnboardingRequired(messageService.isOnboardingRequired(user.id))
                .build()

            responseObserver.onNext(response)
            responseObserver.onCompleted()
        } catch (ex: Exception) {
            // UNAVAILABLE tells auth the failure is temporary (its token endpoint answers 503 either way)
            val status = if (ex is TransientDataAccessException || ex is DataAccessResourceFailureException) {
                Status.UNAVAILABLE
            } else {
                Status.INTERNAL
            }
            log.error("getUserInfo failed with ${status.code}", "getUserInfo", ex)
            responseObserver.onError(status.withDescription("internal error").withCause(ex).asRuntimeException())
        }
    }
}
