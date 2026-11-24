package com.lagradost.cloudstream3.actions

/** Headless no-op stand-ins: video click actions are an in-player concern. */
abstract class VideoClickAction(val name: String?) {
    open var sourcePlugin: String? = null
}

object VideoClickActionHolder {
    val allVideoClickActions: MutableList<VideoClickAction> = java.util.concurrent.CopyOnWriteArrayList()
}
