package io.uliss.exception.utils

import org.springframework.dao.DataIntegrityViolationException
import java.sql.SQLException

/** SQL states of a write that lost a race: a unique key taken, or a referenced row deleted meanwhile. */
private val RACE_SQL_STATES = setOf("23505", "23503")

/**
 * Whether the violation is a race the client can resolve by reloading (a double submit, two tabs). Not null, length
 * and check violations are missing validation, a server bug.
 */
fun DataIntegrityViolationException.isConstraintRace(): Boolean =
    generateSequence<Throwable>(this) { it.cause }
        .filterIsInstance<SQLException>()
        .any { it.sqlState in RACE_SQL_STATES }
