package io.uliss.auth.model

import io.uliss.database.entity.UuidEntity
import jakarta.persistence.Entity
import jakarta.persistence.Table
import org.springframework.security.core.userdetails.User
import org.springframework.security.core.userdetails.UserDetails

@Entity
@Table(name = "users", schema = "auth")
class UserEntity(
    var email: String,
    var passwordHash: String,
    var status: UserStatus
) : UuidEntity() {

    override fun toString(): String {
        return "User(id=${id}, status=$status, email='$email'" + super.toString()
    }
}

fun UserEntity.toUserDetails(): UserDetails = User.builder()
    .username(email)
    .password(passwordHash)
    .accountLocked(status == UserStatus.DISABLED)
    .roles(UserRole.USER.toString())
    .build()