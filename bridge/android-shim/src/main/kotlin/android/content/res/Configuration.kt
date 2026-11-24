package android.content.res

class Configuration {
    var uiMode: Int = UI_MODE_TYPE_NORMAL
    var orientation: Int = ORIENTATION_UNDEFINED
    var fontScale: Float = 1.0f
    var locale: java.util.Locale = java.util.Locale.getDefault()

    companion object {
        const val UI_MODE_TYPE_NORMAL = 1
        const val UI_MODE_TYPE_DESK = 2
        const val UI_MODE_TYPE_TELEVISION = 4
        const val UI_MODE_TYPE_APPLIANCE = 8
        const val UI_MODE_TYPE_WATCH = 16
        const val UI_MODE_NIGHT_MASK = 48
        const val UI_MODE_NIGHT_YES = 32
        const val UI_MODE_NIGHT_NO = 16
        const val ORIENTATION_UNDEFINED = 0
        const val ORIENTATION_PORTRAIT = 1
        const val ORIENTATION_LANDSCAPE = 2
    }
}
