package androidx.compose.runtime

/**
 * Compose runtime annotations that extensions carry in their constant pool.
 * The headless host never runs Compose; the stubs exist so that class
 * verification does not depend on compose-runtime being present.
 */
annotation class Stable
annotation class Immutable
annotation class FrequentlyChangingValue
annotation class JvmDefaultRemember
