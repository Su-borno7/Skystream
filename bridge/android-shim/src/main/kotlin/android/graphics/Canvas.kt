package android.graphics

open class Canvas {
    open fun drawPath(path: Path, paint: Paint) {}
    open fun save(): Int = 0
    open fun restore() {}
    open fun translate(dx: Float, dy: Float) {}
    open fun scale(sx: Float, sy: Float) {}
    open fun rotate(degrees: Float) {}
    open fun drawColor(color: Int) {}
    open fun drawRect(left: Float, top: Float, right: Float, bottom: Float, paint: Paint) {}
    open fun drawRoundRect(left: Float, top: Float, right: Float, bottom: Float, rx: Float, ry: Float, paint: Paint) {}
    open fun drawCircle(cx: Float, cy: Float, radius: Float, paint: Paint) {}
    open fun drawBitmap(bitmap: Bitmap, src: Rect?, dst: Rect, paint: Paint?) {}
    open fun width(): Int = 0
    open fun height(): Int = 0
}

class Path {
    open fun moveTo(x: Float, y: Float) {}
    open fun lineTo(x: Float, y: Float) {}
    open fun close() {}
    open fun quadTo(x1: Float, y1: Float, x2: Float, y2: Float) {}
    open fun cubicTo(x1: Float, y1: Float, x2: Float, y2: Float, x3: Float, y3: Float) {}
    open fun arcTo(left: Float, top: Float, right: Float, bottom: Float, startAngle: Float, sweepAngle: Float, forceMoveTo: Boolean) {}
    open fun transform(matrix: Matrix) {}
    open fun reset() {}
}

class Matrix {
    open fun setScale(sx: Float, sy: Float) {}
    open fun setTranslate(dx: Float, dy: Float) {}
    open fun preTranslate(dx: Float, dy: Float) {}
    open fun postTranslate(dx: Float, dy: Float) {}
}

open class Paint {
    var alpha: Int = 255
    open fun setAlpha(a: Int) { alpha = a }
    open fun setColor(color: Int) {}
    open fun setStyle(style: Style?) {}
    open fun setStrokeWidth(width: Float) {}
    open fun setStrokeJoin(join: Join?) {}
    open fun setStrokeCap(cap: Cap?) {}
    open fun setColorFilter(filter: ColorFilter?) {}
    open fun setAntiAlias(aa: Boolean) {}
    open fun setTextSize(size: Float) {}
    open fun setTypeface(typeface: Typeface?) {}
    enum class Style { FILL, STROKE, FILL_AND_STROKE }
    enum class Join { MITER, ROUND, BEVEL }
    enum class Cap { BUTT, ROUND, SQUARE }
}

class Bitmap {
    companion object {
        @JvmStatic
        fun createBitmap(width: Int, height: Int, config: Config?): Bitmap = Bitmap()
    }
    enum class Config { ALPHA_8, RGB_565, ARGB_8888, ARGB_4444 }
    fun getWidth(): Int = 0
    fun getHeight(): Int = 0
    fun recycle() {}
}

class Rect(var left: Int = 0, var top: Int = 0, var right: Int = 0, var bottom: Int = 0) {
    fun width(): Int = right - left
    fun height(): Int = bottom - top
    fun set(l: Int, t: Int, r: Int, b: Int) { left = l; top = t; right = r; bottom = b }
}

class ColorFilter
open class Typeface {
    companion object {
        @JvmField val DEFAULT: Typeface = Typeface()
        @JvmField val BOLD: Typeface = Typeface()
        @JvmField val DEFAULT_BOLD: Typeface = Typeface()
        @JvmField val MONOSPACE: Typeface = Typeface()
        @JvmField val SANS_SERIF: Typeface = Typeface()
        @JvmField val SERIF: Typeface = Typeface()
        @JvmStatic
        fun create(family: String?, style: Int): Typeface = Typeface()

        const val NORMAL = 0
        const val ITALIC = 2
        const val BOLD_ITALIC = 3
    }
}
