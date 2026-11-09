package io.uliss.note_service.util

import java.net.URI
import java.net.URISyntaxException

/**
 * A note poster link. The server never fetches it, so only its shape is checked here; whether it loads and is a big
 * enough image is the browser's check.
 */
object PosterUrlNormalizer {
    const val MAX_CHARS = 2048

    /** The trimmed link; null when it is not an absolute https link with a host and no credentials. */
    fun normalize(raw: String): String? {
        val url = raw.trim()
        if (url.length > MAX_CHARS) return null
        val uri = try {
            URI(url)
        } catch (_: URISyntaxException) {
            return null
        }
        if (!uri.scheme.equals("https", ignoreCase = true) || uri.isOpaque) return null
        return url.takeIf { !uri.host.isNullOrEmpty() && uri.rawUserInfo == null }
    }
}
