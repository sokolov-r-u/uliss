package io.uliss.note_service

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class NoteServiceApplication

fun main(args: Array<String>) {
    runApplication<NoteServiceApplication>(*args)
}
