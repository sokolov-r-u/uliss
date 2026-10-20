package io.uliss.database.utils

import com.fasterxml.uuid.Generators
import java.util.UUID

private val uuidGenerator = Generators.timeBasedEpochGenerator()

/** Time-ordered UUIDv7: new rows land at the end of the primary key index. */
fun generateId(): UUID = uuidGenerator.generate()
