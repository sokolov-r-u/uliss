package io.uliss.auth.service

import io.uliss.auth.repository.UserRepository
import io.uliss.auth.model.toUserDetails
import org.springframework.security.core.userdetails.UserDetails
import org.springframework.security.core.userdetails.UserDetailsService
import org.springframework.security.core.userdetails.UsernameNotFoundException
import org.springframework.stereotype.Service

@Service
class UserDetailsServiceImpl(
    private val userRepository: UserRepository
) : UserDetailsService {

    override fun loadUserByUsername(username: String): UserDetails {
        val user =
            userRepository.findByEmail(username) ?: throw UsernameNotFoundException("username=${username} wasn't found")
        return user.toUserDetails()
    }
}