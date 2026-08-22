package io.uliss.security.config

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties(prefix = "security.oauth2.client")
class SecurityProperties {
    /** browser-facing: /oauth2/authorize redirect */
    lateinit var authServerPublicUrl: String

    /** service-to-service: /oauth2/token, /oauth2/revoke */
    lateinit var authServerInternalUrl: String
    var secureCookie: Boolean = true
    lateinit var authorizationCode: ClientCredentials
    lateinit var m2m: ClientCredentials
    lateinit var redirectUri: String

    class ClientCredentials {
        var clientId: String = ""
        var clientSecret: String = ""
    }
}



