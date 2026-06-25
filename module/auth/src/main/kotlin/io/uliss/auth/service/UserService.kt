package io.uliss.auth.service

import dto.RegisterUserRequest
import io.uliss.auth.model.UserEntity
import io.uliss.auth.model.UserStatus
import io.uliss.auth.repository.UserRepository
import io.uliss.auth.model.toUserDetails
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
            userRepository.findByEmail(username) ?: throw UsernameNotFoundException("username=${username} wasn't found")
        return user.toUserDetails()
    }

    fun register(request: RegisterUserRequest) {
        val user = UserEntity(
            email = request.email.lowercase(),
            passwordHash = passwordEncoder.encode(request.password)!!,
            status = UserStatus.PENDING_VERIFICATION
        )
        userRepository.save(user)
    }
}