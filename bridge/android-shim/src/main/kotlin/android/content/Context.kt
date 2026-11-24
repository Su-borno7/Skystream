package android.content

import android.content.res.AssetManager
import android.content.res.Resources
import android.os.UserManager
import java.io.File

/** Host-application holder. Set once by the bridge at startup. */
object SkystreamHost {
    @JvmStatic var dataDir: File = File(System.getProperty("java.io.tmpdir"), "skystream")
    @JvmStatic var applicationContext: Context? = null
}

open class Context {
    companion object {
        const val MODE_PRIVATE = 0
        const val MODE_WORLD_READABLE = 1
        const val MODE_WORLD_WRITEABLE = 2
        const val MODE_APPEND = 32768
        const val MODE_MULTI_PROCESS = 4
        const val CONTEXT_INCLUDE_CODE = 1
        const val CONTEXT_IGNORE_SECURITY = 2
    }

    fun getApplicationContext(): Context = SkystreamHost.applicationContext ?: this

    open fun getFilesDir(): File = File(SkystreamHost.dataDir, "files").apply { mkdirs() }
    open fun getCacheDir(): File = File(SkystreamHost.dataDir, "cache").apply { mkdirs() }
    open fun getExternalFilesDir(type: String?): File? = getFilesDir()
    open fun getPackageName(): String = "com.skystream.app"
    open fun getResources(): Resources = Resources()
    open fun getAssets(): AssetManager = AssetManager()
    open fun getSharedPreferences(name: String?, mode: Int): SharedPreferences =
        FileSharedPreferences(File(SkystreamHost.dataDir, "prefs"), name ?: "default")

    open fun getSystemService(name: String?): Any? = when (name) {
        "ui_mode" -> android.app.UiModeManager()
        "user" -> UserManager()
        else -> null
    }

    open fun startActivity(intent: Intent?) {
        println("I/Skystream: ignored startActivity(${intent?.action}) — headless host")
    }

    open fun startService(service: Intent?): android.content.ComponentName? = null
    open fun checkSelfPermission(permission: String?): Int = 0 // PERMISSION_GRANTED
    open fun checkCallingPermission(permission: String?): Int = 0
    open fun getPackageManager(): android.content.pm.PackageManager = android.content.pm.PackageManager()
    open fun getPackageResourcePath(): String = SkystreamHost.dataDir.absolutePath
    open fun getApplicationInfo(): android.content.pm.ApplicationInfo = android.content.pm.ApplicationInfo()
    open fun getClassLoader(): ClassLoader = Context::class.java.classLoader

    @Suppress("UNCHECKED_CAST")
    open fun <T> getSystemService(serviceClass: Class<T>): T? {
        @Suppress("UNCHECKED_CAST")
        return when {
            serviceClass.name == "android.app.UiModeManager" -> android.app.UiModeManager() as T
            serviceClass.name == "android.os.UserManager" -> UserManager() as T
            else -> null
        }
    }
}

open class ContextWrapper(val base: Context) : Context() {
    override fun getFilesDir(): File = base.getFilesDir()
    override fun getCacheDir(): File = base.getCacheDir()
    override fun getPackageName(): String = base.getPackageName()
    override fun getResources(): Resources = base.getResources()
    override fun getAssets(): AssetManager = base.getAssets()
    override fun getSharedPreferences(name: String?, mode: Int): SharedPreferences = base.getSharedPreferences(name, mode)
    override fun getSystemService(name: String?): Any? = base.getSystemService(name)
    override fun startActivity(intent: Intent?) = base.startActivity(intent)
    override fun getPackageManager(): android.content.pm.PackageManager = base.getPackageManager()
    override fun getApplicationContext(): Context = base.getApplicationContext()
}
