package io.uliss.note_service.util

import net.jqwik.api.Assume
import net.jqwik.api.ForAll
import net.jqwik.api.Property
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

class ManualNoteFingerprintPropertyTest {

    @Property(tries = 300)
    fun `the same title, content and icon give the same fingerprint`(
        @ForAll title: String,
        @ForAll content: String,
        @ForAll icon: String?,
    ) {
        assertEquals(ManualNoteFingerprint.of(title, content, icon), ManualNoteFingerprint.of(title, content, icon))
    }

    @Property(tries = 300)
    fun `bodies that differ in any field give different fingerprints`(
        @ForAll title: String,
        @ForAll content: String,
        @ForAll icon: String?,
        @ForAll otherTitle: String,
        @ForAll otherContent: String,
        @ForAll otherIcon: String?,
    ) {
        Assume.that(title != otherTitle || content != otherContent || icon != otherIcon)

        assertNotEquals(
            ManualNoteFingerprint.of(title, content, icon),
            ManualNoteFingerprint.of(otherTitle, otherContent, otherIcon),
        )
    }

    @Property(tries = 300)
    fun `moving text between title and content changes the fingerprint`(
        @ForAll title: String,
        @ForAll content: String,
    ) {
        Assume.that(content.isNotEmpty())

        assertNotEquals(
            ManualNoteFingerprint.of(title, content, null),
            ManualNoteFingerprint.of(title + content.first(), content.drop(1), null),
        )
    }
}
