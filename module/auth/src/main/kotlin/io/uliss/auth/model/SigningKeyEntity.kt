package io.uliss.auth.model

import io.uliss.database.entity.UuidEntity
import jakarta.persistence.Entity
import jakarta.persistence.Table
import java.security.KeyFactory
import java.security.KeyPair
import java.security.spec.PKCS8EncodedKeySpec
import java.security.spec.X509EncodedKeySpec
import java.util.Base64

@Entity
@Table(name = "signing_keys", schema = "auth")
class SigningKeyEntity(
    var privateKey: String,
    var publicKey: String
) : UuidEntity()

fun SigningKeyEntity.toKeyPair(): KeyPair {
    val keyFactory = KeyFactory.getInstance("RSA")
    val privateKey = keyFactory.generatePrivate(
        PKCS8EncodedKeySpec(Base64.getDecoder().decode(this.privateKey))
    )
    val publicKey = keyFactory.generatePublic(
        X509EncodedKeySpec(Base64.getDecoder().decode(this.publicKey))
    )
    return KeyPair(publicKey, privateKey)
}
