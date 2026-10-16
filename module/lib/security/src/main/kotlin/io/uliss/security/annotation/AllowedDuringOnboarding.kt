package io.uliss.security.annotation

/**
 * Marks a controller or handler a user may call while blocking onboarding steps are pending
 * (the `onboardingRequired` token claim); everything else answers `403 ONBOARDING_REQUIRED`.
 */
@Target(AnnotationTarget.CLASS, AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class AllowedDuringOnboarding
