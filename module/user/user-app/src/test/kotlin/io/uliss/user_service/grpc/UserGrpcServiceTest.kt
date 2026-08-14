package io.uliss.user_service.grpc

import io.grpc.Status
import io.grpc.stub.StreamObserver
import io.uliss.api.user.v1.UserInfoRequest
import io.uliss.api.user.v1.UserInfoResponse
import io.uliss.user_service.model.UserEntity
import io.uliss.user_service.service.UserProfileService
import org.junit.jupiter.api.Test
import org.mockito.ArgumentCaptor
import org.mockito.Mockito
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class UserGrpcServiceTest {

    private val userProfileService = Mockito.mock(UserProfileService::class.java)
    private val grpcService = UserGrpcService(userProfileService)

    @Suppress("UNCHECKED_CAST")
    private val responseObserver = Mockito.mock(StreamObserver::class.java) as StreamObserver<UserInfoResponse>

    private fun request(authId: String) = UserInfoRequest.newBuilder().setAuthId(authId).build()

    @Test
    fun `returns user info with displayName when set`() {
        val authId = UUID.randomUUID()
        val user = UserEntity(authId = authId, displayName = "Bob")
        Mockito.`when`(userProfileService.getOrCreate(authId)).thenReturn(user)

        grpcService.getUserInfo(request(authId.toString()), responseObserver)

        val captor = ArgumentCaptor.forClass(UserInfoResponse::class.java)
        Mockito.verify(responseObserver).onNext(captor.capture())
        Mockito.verify(responseObserver).onCompleted()
        assertEquals(user.id.toString(), captor.value.userId)
        assertTrue(captor.value.hasDisplayName())
        assertEquals("Bob", captor.value.displayName)
    }

    @Test
    fun `returns user info without displayName when null`() {
        val authId = UUID.randomUUID()
        val user = UserEntity(authId = authId, displayName = null)
        Mockito.`when`(userProfileService.getOrCreate(authId)).thenReturn(user)

        grpcService.getUserInfo(request(authId.toString()), responseObserver)

        val captor = ArgumentCaptor.forClass(UserInfoResponse::class.java)
        Mockito.verify(responseObserver).onNext(captor.capture())
        assertFalse(captor.value.hasDisplayName())
    }

    @Test
    fun `malformed authId maps to INVALID_ARGUMENT`() {
        grpcService.getUserInfo(request("not-a-uuid"), responseObserver)

        val captor = ArgumentCaptor.forClass(Throwable::class.java)
        Mockito.verify(responseObserver).onError(captor.capture())
        Mockito.verify(responseObserver, Mockito.never()).onNext(Mockito.any())
        assertEquals(Status.INVALID_ARGUMENT.code, Status.fromThrowable(captor.value).code)
    }

    @Test
    fun `unexpected failure maps to INTERNAL`() {
        val authId = UUID.randomUUID()
        Mockito.`when`(userProfileService.getOrCreate(authId)).thenThrow(RuntimeException("boom"))

        grpcService.getUserInfo(request(authId.toString()), responseObserver)

        val captor = ArgumentCaptor.forClass(Throwable::class.java)
        Mockito.verify(responseObserver).onError(captor.capture())
        assertEquals(Status.INTERNAL.code, Status.fromThrowable(captor.value).code)
    }
}
