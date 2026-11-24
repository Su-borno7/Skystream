package android.content.pm

class NameNotFoundException(message: String? = null) : Exception(message)

class PackageInfo {
    var packageName: String? = null
    var versionName: String? = null
    var versionCode: Int = 0
}

class ApplicationInfo {
    var packageName: String = "com.skystream.app"
    var flags: Int = 0
    var sourceDir: String = ""
    var loadLabel(pm: PackageManager): String = "Skystream"
}

open class PackageManager {
    companion object {
        const val PERMISSION_GRANTED = 0
        const val PERMISSION_DENIED = -1
        const val MATCH_DEFAULT_ONLY = 1
        const val GET_META_DATA = 128
        const val MATCH_UNINSTALLED_PACKAGES = 128
    }

    open fun getPackageInfo(packageName: String, flags: Int): PackageInfo = throw NameNotFoundException(packageName)
    open fun getLaunchIntentForPackage(packageName: String): android.content.Intent? = null
    open fun getInstalledPackages(flags: Int): List<PackageInfo> = emptyList()
    open fun queryIntentActivities(intent: android.content.Intent?, flags: Int): List<Any> = emptyList()
    open fun getPackageInfo(packageName: String, flags: Long): PackageInfo = throw NameNotFoundException(packageName)
    fun getApplicationInfo(packageName: String, flags: Int): ApplicationInfo = ApplicationInfo().apply { this.packageName = packageName }
}
