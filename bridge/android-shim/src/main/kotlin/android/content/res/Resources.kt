package android.content.res

import android.util.DisplayMetrics

class Resources {
    val displayMetrics: DisplayMetrics = DisplayMetrics()

    companion object {
        @JvmStatic
        fun getSystem(): Resources = Resources()
    }

    fun getConfiguration(): Configuration = Configuration()
    fun getIdentifier(name: String?, defType: String?, defPackage: String?): Int = 0
    fun getString(id: Int): String = ""
    fun getString(id: Int, vararg formatArgs: Any?): String = ""
    fun getBoolean(id: Int): Boolean = false
    fun getColor(id: Int): Int = 0xFFFFFFFF.toInt()
    fun getColor(id: Int, theme: Any?): Int = 0xFFFFFFFF.toInt()
    fun getDimension(id: Int): Float = 0f
    fun getDimensionPixelSize(id: Int): Int = 0
    fun getQuantityString(id: Int, quantity: Int): String = ""
    fun getText(id: Int): CharSequence = ""
    fun openRawResource(id: Int): java.io.InputStream = java.io.ByteArrayInputStream(ByteArray(0))
    fun getAssets(): AssetManager = AssetManager()
    fun getDrawable(id: Int): android.graphics.drawable.Drawable? = null
    fun getDrawable(id: Int, theme: Any?): android.graphics.drawable.Drawable? = null
}
