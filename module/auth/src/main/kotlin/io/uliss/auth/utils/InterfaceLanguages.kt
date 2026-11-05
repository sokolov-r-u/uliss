package io.uliss.auth.utils

/** The cookie the web app and these pages share for an explicit interface language (design system `LOCALE_COOKIE`). */
const val LANGUAGE_COOKIE = "uliss_lang"

/** Interface languages, as the cookie stores them. */
val SUPPORTED_LANGUAGES = setOf("en", "ru")

/** The supported language a tag names (`ru`, `ru-RU`, ` EN_gb `), as the web app's `parseLocale`; null otherwise. */
fun findSupportedLanguage(tag: String?): String? =
    tag?.trim()?.lowercase()?.split('-', '_')?.first()?.takeIf { it in SUPPORTED_LANGUAGES }
