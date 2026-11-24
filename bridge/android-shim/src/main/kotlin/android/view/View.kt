package android.view

open class View(context: android.content.Context? = null) {
    var visibility: Int = VISIBLE
    var tag: Any? = null
    var isEnabled: Boolean = true
    var isFocusable: Boolean = true

    open fun findViewById(id: Int): View? = null
    open fun setVisibility(visibility: Int) { this.visibility = visibility }
    open fun getVisibility(): Int = visibility
    open fun setTag(tag: Any?) { this.tag = tag }
    open fun getTag(): Any? = tag
    open fun post(action: Runnable): Boolean { action.run(); return true }
    open fun postDelayed(action: Runnable, delayMillis: Long): Boolean { action.run(); return true }

    companion object {
        const val VISIBLE = 0
        const val INVISIBLE = 4
        const val GONE = 8
        const val NO_ID = -1
        const val FOCUS_DOWN = 130
        const val FOCUS_UP = 33
        const val FOCUS_LEFT = 17
        const val FOCUS_RIGHT = 66
    }
}
