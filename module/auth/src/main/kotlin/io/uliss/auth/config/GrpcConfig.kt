package io.uliss.auth.config

import io.grpc.ManagedChannel
import io.grpc.ManagedChannelBuilder
import io.uliss.api.user.v1.UserServiceGrpc
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class GrpcConfig(
    @Value($$"${grpc.user-service.host}") private val userServiceHost: String,
    @Value($$"${grpc.user-service.port}") private val userServicePort: Int,
) {

    @Bean
    fun userServiceChanel(): ManagedChannel =
        ManagedChannelBuilder.forAddress(userServiceHost, userServicePort)
            .usePlaintext()
            .build()

    @Bean
    fun userServiceBlockingStub(chanel: ManagedChannel): UserServiceGrpc.UserServiceBlockingStub =
        UserServiceGrpc.newBlockingStub(chanel)
}