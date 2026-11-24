package android.graphics

object Color {
    const val BLACK = -0x1000000
    const val WHITE = -0x1
    const val RED = -0x10000
    const val GREEN = -0xff0100
    const val BLUE = -0xffff01
    const val TRANSPARENT = 0

    @JvmStatic
    fun parseColor(colorString: String): Int {
        val s = colorString.trim()
        if (!s.startsWith("#")) {
            return when (s.lowercase()) {
                "black" -> BLACK; "white" -> WHITE; "red" -> RED
                "green" -> GREEN; "blue" -> BLUE; "transparent" -> TRANSPARENT
                else -> throw IllegalArgumentException("Unknown color: $colorString")
            }
        }
        var hex = s.substring(1)
        if (hex.length == 3) hex = hex.map { "$it$it" }.joinToString("")
        if (hex.length == 6) hex = "FF$hex"
        if (hex.length != 8) throw IllegalArgumentException("Unknown color: $colorString")
        return hex.toLong(16).toInt()
    }

    @JvmStatic
    fun argb(alpha: Int, red: Int, green: Int, blue: Int): Int =
        ((alpha and 0xff) shl 24) or ((red and 0xff) shl 16) or ((green and 0xff) shl 8) or (blue and 0xff)

    @JvmStatic
    fun alpha(color: Int): Int = (color ushr 24) and 0xff
    @JvmStatic
    fun red(color: Int): Int = (color ushr 16) and 0xff
    @JvmStatic
    fun green(color: Int): Int = (color ushr 8) and 0xff
    @JvmStatic
    fun blue(color: Int): Int = color and 0xff
}
