package android.graphics.drawable

import android.graphics.Canvas
import android.graphics.ColorFilter

open class Drawable {
    open fun draw(canvas: Canvas) {}
    open fun setBounds(left: Int, top: Int, right: Int, bottom: Int) {}
    open fun setBounds(bounds: android.graphics.Rect) {}
    open fun setAlpha(alpha: Int) {}
    open fun setColorFilter(colorFilter: ColorFilter?) {}
    open fun getIntrinsicWidth(): Int = -1
    open fun getIntrinsicHeight(): Int = -1
    open fun setOpacity(opacity: Int): Boolean = false
}

open class ColorDrawable(@Suppress("UNUSED_PARAMETER") color: Int) : Drawable() {
    constructor() : this(0)
    open fun setColor(color: Int) {}
    open fun getColor(): Int = 0
}

open class GradientDrawable() : Drawable() {
    constructor(orientation: Orientation?, colors: IntArray?) : this()
    constructor(orientation: Orientation?, colors: List<Int>?) : this()
    enum class Orientation { TOP_BOTTOM, TR_BL, RIGHT_LEFT, BR_TL, BOTTOM_TOP, BL_TR, LEFT_RIGHT, TL_BR }
    enum class GradientType { LINEAR_GRADIENT, RADIAL_GRADIENT, SWEEP_GRADIENT }
    open fun setColor(color: Int) {}
    open fun setColors(colors: IntArray?) {}
    open fun setCornerRadius(radius: Float) {}
    open fun setCornerRadii(radii: FloatArray?) {}
    open fun setStroke(width: Int, color: Int) {}
    open fun setStroke(width: Int, color: Int, dashWidth: Float, dashGap: Float) {}
    open fun setOrientation(orientation: Orientation?) {}
    open fun setGradientType(gradientType: GradientType?) {}
    open fun setGradientRadius(radius: Float) {}
    open fun setGradientCenter(x: Float, y: Float) {}
}
