package com.lagradost.cloudstream3.plugins

import android.content.Context
import android.content.res.Resources
import android.util.Log
import com.lagradost.cloudstream3.actions.VideoClickAction
import com.lagradost.cloudstream3.actions.VideoClickActionHolder

abstract class Plugin : BasePlugin() {
    /**
     * Called when your Plugin is loaded. If not overridden then the
     * cross-platform load() is used.
     */
    @Throws(Throwable::class)
    open fun load(context: Context) {
        load()
    }

    fun registerVideoClickAction(element: VideoClickAction) {
        Log.i(PLUGIN_TAG, "Adding ${element.name} VideoClickAction")
        element.sourcePlugin = this.filename
        VideoClickActionHolder.allVideoClickActions.add(element)
    }

    /** Resources for providers that specified requiresResources in gradle. */
    var resources: Resources? = null

    /** Custom settings hook: not invoked in the headless host. */
    var openSettings: ((context: Context) -> Unit)? = null
}
