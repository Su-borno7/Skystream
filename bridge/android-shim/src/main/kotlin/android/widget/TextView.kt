package android.widget

import android.view.View

open class TextView @JvmOverloads constructor(context: android.content.Context? = null) : View(context) {
    private var text: CharSequence? = null
    var maxLines: Int = Int.MAX_VALUE

    open fun setText(text: CharSequence?) { this.text = text }
    open fun setText(resId: Int) { this.text = "" }
    open fun getText(): CharSequence? = text
    open fun setHint(hint: CharSequence?) {}
    open fun setTextSize(unit: Int, size: Float) {}
    open fun setTextColor(color: Int) {}
    open fun setSingleLine(singleLine: Boolean) {}
}
