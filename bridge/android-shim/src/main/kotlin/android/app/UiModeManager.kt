package android.app

import android.content.res.Configuration

class UiModeManager {
    fun getCurrentModeType(): Int = Configuration.UI_MODE_TYPE_NORMAL
    fun getNightMode(): Int = 0x1 // MODE_NIGHT_NO
    fun setNightMode(mode: Int) {}
}
