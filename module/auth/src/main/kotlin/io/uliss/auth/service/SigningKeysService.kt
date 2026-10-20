package io.uliss.auth.service

import io.uliss.auth.repository.SigningKeyRepository
import io.uliss.auth.model.SigningKeyEntity
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.util.Base64

@Service
class SigningKeysService(
    private val signingKeyRepository: SigningKeyRepository
) {
    @Transactional
    fun getOrGenerate(): SigningKeyEntity {
        signingKeyRepository.lockKeyCreation()
        return signingKeyRepository.findTopByOrderByCreatedAtDesc() ?: generateAndSave()
    }

    private fun generateAndSave(): SigningKeyEntity {
        val keyPair = generateKeyPair()
        val signingKeyEntity = SigningKeyEntity(
            privateKey = Base64.getEncoder().encodeToString(keyPair.private.encoded),
            publicKey = Base64.getEncoder().encodeToString(keyPair.public.encoded)
        )
        return signingKeyRepository.save(signingKeyEntity)
    }

    private fun generateKeyPair(): KeyPair {
        val keyPairGenerator = KeyPairGenerator.getInstance("RSA")
        keyPairGenerator.initialize(2048)
        return keyPairGenerator.generateKeyPair()
    }

}
