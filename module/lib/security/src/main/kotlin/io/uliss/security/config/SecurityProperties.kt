package io.uliss.security.config

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties(prefix = "security.oauth2.client")
class SecurityProperties(
    var authServerUrl: String,
    var secureCookie: Boolean,
    var redirectUri: String,
    var authorizationCode: ClientCredentials,
    var m2m: ClientCredentials
    /** Each service must define its own redirect URI: security.oauth2.client.redirect-uri=\${SERVER_URL}/oauth2/callback */
) {
    class ClientCredentials {
        var clientId: String = ""
        var clientSecret: String = ""
    }

}


