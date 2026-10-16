package io.uliss.note_service.config

import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.chat.client.advisor.SimpleLoggerAdvisor
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class ChatClientConfig {

    /** At DEBUG (`LOG_LEVEL_AI`) every model request and its full response are logged untruncated, for prompt debugging. */
    @Bean
    fun chatClient(builder: ChatClient.Builder): ChatClient =
        builder.defaultAdvisors(SimpleLoggerAdvisor()).build()
}
