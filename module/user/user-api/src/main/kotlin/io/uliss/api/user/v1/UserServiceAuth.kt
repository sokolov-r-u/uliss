package io.uliss.api.user.v1

/** Service token contract for gRPC calls to user-service: auth signs it, user-service accepts nothing else. */
object UserServiceAuth {
    /** `aud` claim of the service token; user tokens never carry it. */
    const val AUDIENCE = "user-service"

    /** `sub` claim of the service token: only auth calls user-service. */
    const val SUBJECT = "auth-service"

    /** `scope` claim required to call [UserServiceGrpc.UserServiceImplBase.getUserInfo]. */
    const val USER_INFO_SCOPE = "user.info"
}
