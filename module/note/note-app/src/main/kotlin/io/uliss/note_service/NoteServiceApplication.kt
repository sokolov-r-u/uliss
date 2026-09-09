package io.uliss.note_service

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.context.properties.ConfigurationPropertiesScan
import org.springframework.boot.runApplication

@SpringBootApplication
@ConfigurationPropertiesScan
class NoteServiceApplication

fun main(args: Array<String>) {
    runApplication<NoteServiceApplication>(*args)
}
