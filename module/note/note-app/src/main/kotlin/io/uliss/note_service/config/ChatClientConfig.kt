package io.uliss.note_service.config

import org.springframework.ai.chat.client.ChatClient
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class ChatClientConfig {

    @Bean
    fun chatClient(builder: ChatClient.Builder): ChatClient = builder.build()
}
