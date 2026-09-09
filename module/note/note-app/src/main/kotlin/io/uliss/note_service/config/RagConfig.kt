package io.uliss.note_service.config

import org.springframework.ai.embedding.BatchingStrategy
import org.springframework.ai.embedding.TokenCountBatchingStrategy
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class RagConfig {

    @Bean
    fun embeddingBatchingStrategy(): BatchingStrategy = TokenCountBatchingStrategy()
}
