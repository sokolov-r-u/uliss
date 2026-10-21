package io.uliss.auth.config

import io.grpc.ManagedChannel
import io.grpc.ManagedChannelBuilder
import io.uliss.api.user.v1.UserServiceGrpc
import io.uliss.auth.interceptor.DefaultDeadlineInterceptor
import io.uliss.auth.service.UserServiceTokenProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.grpc.client.interceptor.security.BearerTokenAuthenticationInterceptor
import java.time.Duration
import java.util.function.Supplier

@Configuration
class GrpcConfig(
    @Value($$"${grpc.user-service.host}") private val userServiceHost: String,
    @Value($$"${grpc.user-service.port}") private val userServicePort: Int,
    @Value($$"${grpc.user-service.deadline}") private val userServiceDeadline: Duration,
) {

    @Bean
    fun userServiceChannel(tokenProvider: UserServiceTokenProvider): ManagedChannel =
        ManagedChannelBuilder.forAddress(userServiceHost, userServicePort)
            .usePlaintext()
            .intercept(
                DefaultDeadlineInterceptor(userServiceDeadline),
                // user-service accepts only this service token (see UserServiceAuth)
                BearerTokenAuthenticationInterceptor(Supplier(tokenProvider::getToken)),
            )
            .build()

    @Bean
    fun userServiceBlockingStub(channel: ManagedChannel): UserServiceGrpc.UserServiceBlockingStub =
        UserServiceGrpc.newBlockingStub(channel)
}