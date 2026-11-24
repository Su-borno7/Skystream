@file:OptIn(com.lagradost.cloudstream3.InternalAPI::class)

package com.lagradost.cloudstream3.utils

import android.content.Context
import android.content.SharedPreferences
import com.lagradost.cloudstream3.CloudStreamApp
import com.lagradost.cloudstream3.utils.AppUtils.toJsonLiteral

const val PREFERENCES_NAME = "rebuild_preference"

fun getFolderName(folder: String, path: String): String = "${folder}/${path}"

/**
 * Upstream stores extension settings in one shared prefs file. The shim keeps
 * the exact same file name and JSON codec so extension settings are stable.
 */
object DataStore {

    fun Context.getSharedPrefs(): SharedPreferences =
        getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun Context.containsKey(path: String): Boolean = getSharedPrefs().contains(path)

    fun Context.getKeys(folder: String): List<String> {
        val fixed = folder.trimEnd('/') + "/"
        return getSharedPrefs().all.keys.filter { it.startsWith(fixed) }
    }

    fun Context.removeKey(path: String) {
        try {
            getSharedPrefs().edit().remove(path).apply()
        } catch (e: Exception) {
            com.lagradost.cloudstream3.mvvm.logError(e)
        }
    }

    fun Context.removeKeys(folder: String): Int {
        val keys = getKeys(folder)
        return try {
            val editor = getSharedPrefs().edit()
            keys.forEach { editor.remove(it) }
            editor.apply()
            keys.size
        } catch (e: Exception) {
            com.lagradost.cloudstream3.mvvm.logError(e)
            0
        }
    }

    fun <T> Context.setKey(path: String, value: T) {
        try {
            getSharedPrefs().edit()
                .putString(path, value?.let { it.toJsonLiteral() })
                .apply()
        } catch (e: Exception) {
            com.lagradost.cloudstream3.mvvm.logError(e)
        }
    }

    fun <T> Context.setKey(folder: String, path: String, value: T) =
        setKey(getFolderName(folder, path), value)

    fun <T : Any> Context.getKey(path: String, valueType: Class<T>): T? = try {
        val json = getSharedPrefs().getString(path, null) ?: return null
        com.lagradost.cloudstream3.utils.AppUtils.parseJson(json, valueType.kotlin)
    } catch (_: Exception) {
        null
    }

    inline fun <reified T : Any> Context.getKey(path: String, defVal: T?): T? = try {
        val json = getSharedPrefs().getString(path, null) ?: return defVal
        com.lagradost.cloudstream3.utils.AppUtils.parseJson<T>(json)
    } catch (_: Exception) {
        null
    }

    inline fun <reified T : Any> Context.getKey(path: String): T? = getKey(path, null as T?)

    inline fun <reified T : Any> Context.getKey(folder: String, path: String): T? =
        getKey<T>(getFolderName(folder, path), null as T?)

    inline fun <reified T : Any> Context.getKey(folder: String, path: String, defVal: T?): T? =
        getKey<T>(getFolderName(folder, path), defVal) ?: defVal
}
