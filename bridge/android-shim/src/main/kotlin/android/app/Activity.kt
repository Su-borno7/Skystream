package android.app

import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.content.res.Resources

open class Activity : Context() {
    open fun isDestroyed(): Boolean = false
    open fun isFinishing(): Boolean = false
    open fun isChangingConfigurations(): Boolean = false

    open fun getIntent(): Intent = Intent()
    open fun setIntent(intent: Intent?) {}

    open fun runOnUiThread(action: Runnable) {
        action.run()
    }

    open fun finish() {}
    open fun recreate() {}
    override fun getResources(): Resources = Resources()

    open fun onCreate(savedInstanceState: Any?) {}
    open fun onDestroy() {}
    open fun onConfigurationChanged(newConfig: Configuration) {}
    open fun setRequestedOrientation(requestedOrientation: Int) {}
    open fun getRequestedOrientation(): Int = 0
    open fun getComponentName(): android.content.ComponentName =
        android.content.ComponentName(getPackageName(), javaClass.name)
    override fun startActivity(intent: Intent?) {}
    open fun startActivityForResult(intent: Intent?, requestCode: Int) {}
    open fun setResult(resultCode: Int) {}
    open fun setResult(resultCode: Int, data: Intent?) {}
    open fun getCallingActivity(): android.content.ComponentName? = null
    open fun getCallingPackage(): String? = null
    open fun requestWindowFeature(featureId: Int): Boolean = true
    open fun getTitle(): CharSequence = "Skystream"
    open fun setTitle(title: CharSequence?) {}
    open fun setTitle(titleId: Int) {}
    open fun getPackageName2(): String = getPackageName()
}

open class Application : Context() {
    open fun onCreate() {}
    open fun attachBaseContext(base: Context?) {}
    open fun onTerminate() {}
}

open class Dialog(context: Context, themeResId: Int = 0) : Activity() {
    constructor(context: Context) : this(context, 0)
    open fun show() {}
    open fun dismiss() {}
    open fun setCancelable(cancel: Boolean) {}
    open fun setCanceledOnTouchOutside(cancel: Boolean) {}
    open fun setOnShowListener(listener: Any?) {}
    open fun setOnDismissListener(listener: Any?) {}
    open fun setOnKeyListener(listener: Any?): Boolean = false
    open fun getWindow(): Any? = null
    open fun findViewById(id: Int): android.view.View? = null
    open fun setContentView(view: Any?) {}
}
