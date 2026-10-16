package io.uliss.security.service

import org.springframework.web.client.ResourceAccessException
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.net.http.HttpConnectTimeoutException
import java.net.http.HttpTimeoutException
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ConnectFailureTest {

    @Test
    fun `failures before the request is sent are connect failures`() {
        assertTrue(isConnectFailure(wrap(ConnectException("refused"))))
        assertTrue(isConnectFailure(wrap(UnknownHostException("auth"))))
        assertTrue(isConnectFailure(wrap(HttpConnectTimeoutException("connect timed out"))))
    }

    @Test
    fun `failures after the request may have been sent are not connect failures`() {
        assertFalse(isConnectFailure(wrap(HttpTimeoutException("request timed out"))))
        assertFalse(isConnectFailure(wrap(SocketTimeoutException("Read timed out"))))
        assertFalse(isConnectFailure(wrap(IOException("Connection reset"))))
    }

    private fun wrap(cause: IOException) = ResourceAccessException("I/O error", cause)
}
