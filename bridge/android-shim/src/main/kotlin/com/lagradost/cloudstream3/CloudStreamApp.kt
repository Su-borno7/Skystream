@file:OptIn(com.lagradost.cloudstream3.InternalAPI::class)

package com.lagradost.cloudstream3

import android.app.Application
import android.content.Context
import com.lagradost.cloudstream3.utils.AppUtils.parseJson
import com.lagradost.cloudstream3.utils.AppUtils.toJsonLiteral
import com.lagradost.cloudstream3.utils.DataStore
import com.lagradost.cloudstream3.utils.getFolderName

/**
 * Headless stand-in for the upstream application singleton. Extensions call
 * CloudStreamApp.context / getKey / setKey; the backing store is the same
 * "rebuild_preference" prefs file the Android app uses.
 */
open class CloudStreamApp : Application() {

    companion object {
        private var _context: CloudStreamApp? = null

        var context: Context?
            get() = _context
            private set(value) {
                _context = value as? CloudStreamApp
            }

        @JvmStatic
        fun init(app: CloudStreamApp, dataDir: java.io.File) {
            _context = app
            android.content.SkystreamHost.applicationContext = app
            android.content.SkystreamHost.dataDir = dataDir
            dataDir.mkdirs()
        }

        fun <T> setKey(path: String, value: T) {
            context?.setKeyCompat(path, value)
        }

        fun <T> setKey(folder: String, path: String, value: T) {
            context?.setKeyCompat(getFolderName(folder, path), value)
        }

        fun <T> getKey(path: String): T? = context?.getKeyCompat(path)

        fun <T> getKey(folder: String, path: String): T? = context?.getKeyCompat(getFolderName(folder, path))

        fun <T> getKey(path: String, defVal: T?): T? = context?.getKeyCompat(path) ?: defVal

        fun <T> getKey(folder: String, path: String, defVal: T?): T? = context?.getKeyCompat(getFolderName(folder, path)) ?: defVal

        fun <T : Any> getKeyClass(path: String, valueType: Class<T>): T? = context?.getKeyClassCompat(path, valueType)

        fun <T : Any> setKeyClass(path: String, value: T) = context?.setKeyCompat(path, value) ?: Unit

        fun getKeys(folder: String): List<String>? = context?.getKeysCompat(folder)

        fun removeKey(path: String) = context?.removeKeyCompat(path) ?: Unit

        fun removeKey(folder: String, path: String) = context?.removeKeyCompat(getFolderName(folder, path)) ?: Unit

        fun removeKeys(folder: String): Int? = context?.removeKeysCompat(folder)

        fun openBrowser(url: String) {
            println("I/Skystream: openBrowser($url) — headless host, not opened")
        }

        // Shared JSON-backed get/set used by the DataStore object as well.
        @PublishedApi
        internal fun keyPrefs(): android.content.SharedPreferences =
            (context ?: CloudStreamApp()).getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

        const val PREFERENCES_NAME = "rebuild_preference"

        internal fun Context.setKeyCompat(path: String, value: Any?) {
            try {
                getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE).edit()
                    .putString(path, value?.toJsonLiteral())
                    .apply()
            } catch (t: Throwable) {
                System.err.println("W/Skystream: setKey($path) failed: $t")
            }
        }

        @Suppress("UNCHECKED_CAST")
        internal fun <T> Context.getKeyCompat(path: String): T? {
            return try {
                val json = getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE).getString(path, null) ?: return null
                @Suppress("UNCHECKED_CAST")
                parseJson<Any>(json) as T
            } catch (_: Throwable) {
                null
            }
        }

        internal fun <T : Any> Context.getKeyClassCompat(path: String, valueType: Class<T>): T? {
            return try {
                val json = getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE).getString(path, null) ?: return null
                parseJson(json, valueType.kotlin)
            } catch (_: Throwable) {
                null
            }
        }

        internal fun Context.getKeysCompat(folder: String): List<String> {
            val fixed = folder.trimEnd('/') + "/"
            return getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE).all.keys.filter { it.startsWith(fixed) }
        }

        internal fun Context.removeKeyCompat(path: String) {
            getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE).edit().remove(path).apply()
        }

        internal fun Context.removeKeysCompat(folder: String): Int {
            val fixed = folder.trimEnd('/') + "/"
            val prefs = getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
            val keys = prefs.all.keys.filter { it.startsWith(fixed) }
            val editor = prefs.edit()
            keys.forEach { editor.remove(it) }
            editor.apply()
            return keys.size
        }
    }
}
