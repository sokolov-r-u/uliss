package io.uliss.featureflags

/** Keys of the flags in the flagd file. [ALL] is what the web client receives. */
object FeatureFlagKeys {
    const val NOTE_RESUMMARIZE = "note-resummarize"

    val ALL: List<String> = listOf(NOTE_RESUMMARIZE)
}
