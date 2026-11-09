package io.uliss.note_service.util

/**
 * A note poster link. The server never fetches it, so only its shape is checked here; whether it loads and is a big
 * enough image is the browser's check. The SPA sends a browser's `URL.href`, which keeps characters such as `|`, `[`,
 * `{` or `^` unencoded and allows `_` in a host name: `java.net.URI` (RFC 2396) refuses those, so the shape is read
 * here by hand, as leniently as a browser loads it.
 */
object PosterUrlNormalizer {
    const val RULE = "poster must be an https link with a host, no credentials, at most 2048 characters"
    const val MAX_CHARS = 2048

    private const val SCHEME = "https://"

    /** The trimmed link; null when it is not an absolute https link with a host and no credentials. */
    fun normalize(raw: String): String? {
        val url = raw.trim()
        if (url.length > MAX_CHARS) return null
        if (url.any { Character.isWhitespace(it) || Character.isISOControl(it) }) return null
        if (!url.startsWith(SCHEME, ignoreCase = true)) return null
        val authority = url.substring(SCHEME.length).takeWhile { it != '/' && it != '?' && it != '#' }
        return url.takeIf { '@' !in authority && hasHost(authority) }
    }

    /** `host`, `host:port`, `[ipv6]` or `[ipv6]:port`, with a non-empty host and a numeric port. */
    private fun hasHost(authority: String): Boolean {
        val host: String
        val rest: String
        if (authority.startsWith('[')) {
            val end = authority.indexOf(']')
            if (end < 0) return false
            host = authority.substring(1, end)
            rest = authority.substring(end + 1)
        } else {
            host = authority.substringBefore(':')
            rest = authority.substring(host.length)
            if ('[' in host || ']' in host) return false
        }
        val portValid = rest.isEmpty() || (rest.startsWith(':') && rest.drop(1).all { it.isDigit() })
        return host.isNotEmpty() && portValid
    }
}
