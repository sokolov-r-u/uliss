package io.uliss.user_service.service

import io.uliss.user_service.repository.UserMessageReposirory
import org.springframework.stereotype.Service

@Service
class MessageService(private val userMessageReposirory: UserMessageReposirory) {
}