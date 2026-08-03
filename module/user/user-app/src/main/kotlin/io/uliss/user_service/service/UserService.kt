package io.uliss.user_service.service

import io.grpc.Status
import io.grpc.stub.StreamObserver
import io.uliss.api.user.v1.UserInfoRequest
import io.uliss.api.user.v1.UserInfoResponse
import io.uliss.api.user.v1.UserServiceGrpc
import io.uliss.logging.logger.AppLogger
import io.uliss.user_service.model.UserEntity
import io.uliss.user_service.repository.UserRepository
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class UserService(
    private val userRepository: UserRepository
) : UserServiceGrpc.UserServiceImplBase() {
    private val log = AppLogger.of(UserService::class)

    override fun getUserInfo(
        request: UserInfoRequest,
        responseObserver: StreamObserver<UserInfoResponse>
    ) {
        try {
            val authId = UUID.fromString(request.authId)
            val userEntity = userRepository.findByAuthId(authId)
                ?: createUser(authId)

            val response = UserInfoResponse.newBuilder()
                .setUserId(userEntity.id.toString())
                .apply { userEntity.displayName?.let { setDisplayName(it) } }
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

    private fun createUser(authId: UUID): UserEntity {
        return userRepository.save(
            UserEntity(
                authId = authId,
                displayName = null
            )
        )
    }
}