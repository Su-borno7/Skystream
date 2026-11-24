package com.lagradost.cloudstream3

import android.app.Activity
import android.content.res.Resources
import com.lagradost.cloudstream3.utils.UiText
import androidx.annotation.MainThread
import androidx.annotation.StringRes
import java.lang.ref.WeakReference
import kotlin.math.max
import kotlin.math.min

/**
 * Headless stand-in for the upstream activity singleton. Toasts and theme
 * events are logged / dropped; provider code does not depend on them.
 */
object CommonActivity {

    private var _activity: WeakReference<Activity>? = null

    var activity: Activity?
        get() = _activity?.get()
        private set(value) {
            _activity = WeakReference(value)
        }

    @MainThread
    fun setActivityInstance(newActivity: Activity?) {
        activity = newActivity
    }

    val displayMetrics: android.util.DisplayMetrics = Resources.getSystem().displayMetrics

    val screenWidth: Int get() = max(displayMetrics.widthPixels, displayMetrics.heightPixels)
    val screenHeight: Int get() = min(displayMetrics.widthPixels, displayMetrics.heightPixels)
    val screenWidthWithOrientation: Int get() = displayMetrics.widthPixels
    val screenHeightWithOrientation: Int get() = displayMetrics.heightPixels

    var isPipDesired: Boolean = false
    var isInPIPMode: Boolean = false

    val onColorSelectedEvent: com.lagradost.cloudstream3.utils.Event<Pair<Int, Int>> =
        com.lagradost.cloudstream3.utils.Event()
    val onDialogDismissedEvent: com.lagradost.cloudstream3.utils.Event<Int> =
        com.lagradost.cloudstream3.utils.Event()

    var keyEventListener: ((Pair<android.view.KeyEvent?, Boolean>) -> Boolean)? = null
    var appliedTheme: Int = 0
    var appliedColor: Int = 0

    const val TAG = "CommonActivity"

    fun showToast(@StringRes message: Int, duration: Int? = null) {
        println("I/Toast: [res $message]")
    }

    fun showToast(message: String?, duration: Int? = null) {
        println("I/Toast: $message")
    }

    fun showToast(message: UiText?, duration: Int? = null) {
        println("I/Toast: $message")
    }

    @MainThread
    fun showToast(act: Activity?, @StringRes message: Int, duration: Int? = null) {
        println("I/Toast: [res $message]")
    }

    @MainThread
    fun showToast(act: Activity?, message: String?, duration: Int? = null) {
        println("I/Toast: $message")
    }

    @MainThread
    fun showToast(act: Activity?, text: UiText, duration: Int) {
        println("I/Toast: $text")
    }
}
