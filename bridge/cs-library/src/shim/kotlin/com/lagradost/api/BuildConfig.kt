package com.lagradost.api

/**
 * Stand-in for the BuildConfig that upstream generates with the buildkonfig
 * plugin (it carries API keys for MyDramaList/Trakt metadata sync). Cinelab
 * builds the library without those keys; the affected providers simply behave
 * as unauthenticated clients.
 */
object BuildConfig {
    const val MDL_API_KEY: String = ""
    const val TRAKT_CLIENT_ID: String = ""
}
