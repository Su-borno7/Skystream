package android.widget

import android.content.Context

open class Toast(context: Context?) {
    var duration: Int = LENGTH_SHORT
    var view: Any? = null
    private var text: CharSequence = ""

    companion object {
        const val LENGTH_SHORT = 0
        const val LENGTH_LONG = 1

        @JvmStatic
        fun makeText(context: Context?, text: CharSequence?, duration: Int): Toast =
            Toast(context).apply { this.text = text ?: ""; this.duration = duration }

        @JvmStatic
        fun makeText(context: Context?, resId: Int, duration: Int): Toast =
            Toast(context).apply { this.text = ""; this.duration = duration }
    }

    fun setGravity(gravity: Int, xOffset: Int, yOffset: Int) {}
    fun setMargin(horizontalMargin: Float, verticalMargin: Float) {}
    fun setText(resId: Int) {}
    fun setText(s: CharSequence?) { this.text = s ?: "" }
    fun getView(): Any? = view
    fun setView(view: Any?) { this.view = view }
    fun show() { println("I/Toast: $text") }
    fun cancel() {}
}
