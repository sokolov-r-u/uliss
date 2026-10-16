package io.uliss.note_service.config

import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.chat.client.advisor.SimpleLoggerAdvisor
import org.springframework.ai.chat.model.ChatResponse
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class ChatClientConfig {

    /** At DEBUG (`LOG_LEVEL_AI`) every model request and its full response are logged untruncated, for prompt debugging. */
    @Bean
    fun chatClient(builder: ChatClient.Builder): ChatClient =
        builder.defaultAdvisors(
            SimpleLoggerAdvisor.builder().responseToString(::renderResponse).build()
        ).build()

    /** The stream logs its response on completion, so a serialization failure would fail an already delivered reply. */
    private fun renderResponse(response: ChatResponse?): String =
        try {
            SimpleLoggerAdvisor.DEFAULT_RESPONSE_TO_STRING.apply(response)
        } catch (ex: RuntimeException) {
            "<unrenderable: ${ex.javaClass.simpleName}>"
        }
}
