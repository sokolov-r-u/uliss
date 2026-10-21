package io.uliss.auth.service

import io.uliss.auth.dto.RegisterUserRequest
import io.uliss.auth.exception.EmailAlreadyExistsException
import io.uliss.auth.model.UserEntity
import io.uliss.auth.model.UserStatus
import io.uliss.auth.model.toUserDetails
import io.uliss.auth.repository.UserRepository
import org.hibernate.exception.ConstraintViolationException
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.security.core.userdetails.UserDetails
import org.springframework.security.core.userdetails.UserDetailsService
import org.springframework.security.core.userdetails.UsernameNotFoundException
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service

@Service
class UserService(
    private val userRepository: UserRepository,
    private val passwordEncoder: PasswordEncoder
) : UserDetailsService {

    override fun loadUserByUsername(username: String): UserDetails {
        val user =
            userRepository.findByEmail(username.lowercase())
                ?: throw UsernameNotFoundException("username=${username} wasn't found")
        return user.toUserDetails()
    }

    fun register(request: RegisterUserRequest) {
        val user = UserEntity(
            email = request.email.lowercase(),
            passwordHash = passwordEncoder.encode(request.password)
                ?: throw IllegalStateException("password encoder returned no hash"),
            status = UserStatus.PENDING_VERIFICATION
        )
        try {
            userRepository.save(user)
        } catch (ex: DataIntegrityViolationException) {
            // other violations (a too long value, a check constraint) are not a taken email
            if (ex.isUniqueEmailViolation()) throw EmailAlreadyExistsException()
            throw ex
        }
    }
}
private fun DataIntegrityViolationException.isUniqueEmailViolation(): Boolean =
    generateSequence<Throwable>(this) { it.cause }
        .filterIsInstance<ConstraintViolationException>()
        .any { it.constraintName == USERS_EMAIL_UNIQUE }

private const val USERS_EMAIL_UNIQUE = "users_email_unique"
