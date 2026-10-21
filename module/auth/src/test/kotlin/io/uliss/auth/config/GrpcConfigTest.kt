package io.uliss.auth.config

import com.nimbusds.jose.jwk.JWKSet
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator
import com.nimbusds.jose.jwk.source.ImmutableJWKSet
import com.nimbusds.jose.proc.SecurityContext
import io.grpc.Metadata
import io.grpc.Server
import io.grpc.ServerBuilder
import io.grpc.ServerCall
import io.grpc.ServerCallHandler
import io.grpc.ServerInterceptor
import io.grpc.ServerInterceptors
import io.grpc.stub.StreamObserver
import io.uliss.api.user.v1.UserInfoRequest
import io.uliss.api.user.v1.UserInfoResponse
import io.uliss.api.user.v1.UserServiceGrpc
import io.uliss.auth.service.UserServiceTokenProvider
import org.junit.jupiter.api.AfterEach
import java.time.Clock
import java.time.Duration
import kotlin.test.Test
import kotlin.test.assertEquals

class GrpcConfigTest {

    private val authorizationKey = Metadata.Key.of("authorization", Metadata.ASCII_STRING_MARSHALLER)
    private var receivedAuthorization: String? = null

    private val server: Server = ServerBuilder.forPort(0)
        .addService(ServerInterceptors.intercept(FakeUserService(), CapturingInterceptor()))
        .build()
        .start()

    private val tokenProvider = UserServiceTokenProvider(
        ImmutableJWKSet<SecurityContext>(JWKSet(RSAKeyGenerator(2048).keyID("test-key").generate())),
        Clock.systemUTC(),
        "http://auth.test",
    )

    @AfterEach
    fun tearDown() {
        server.shutdownNow()
    }

    @Test
    fun `user-service calls carry the service token`() {
        val config = GrpcConfig("localhost", server.port, Duration.ofSeconds(3))
        val channel = config.userServiceChannel(tokenProvider)

        try {
            config.userServiceBlockingStub(channel).getUserInfo(UserInfoRequest.newBuilder().setAuthId("id").build())
        } finally {
            channel.shutdownNow()
        }

        assertEquals("Bearer ${tokenProvider.getToken()}", receivedAuthorization)
    }

    private inner class CapturingInterceptor : ServerInterceptor {
        override fun <Req, Resp> interceptCall(
            call: ServerCall<Req, Resp>,
            headers: Metadata,
            next: ServerCallHandler<Req, Resp>,
        ): ServerCall.Listener<Req> {
            receivedAuthorization = headers.get(authorizationKey)
            return next.startCall(call, headers)
        }
    }

    private class FakeUserService : UserServiceGrpc.UserServiceImplBase() {
        override fun getUserInfo(request: UserInfoRequest, responseObserver: StreamObserver<UserInfoResponse>) {
            responseObserver.onNext(UserInfoResponse.newBuilder().setUserId("user").build())
            responseObserver.onCompleted()
        }
    }
}
