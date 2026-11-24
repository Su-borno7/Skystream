package com.lagradost.cloudstream3.utils

import android.content.Context

sealed class UiText {
    companion object { const val TAG = "UiText" }

    data class DynamicString(val value: String) : UiText() {
        override fun toString(): String = value
    }

    class StringResource(val resId: Int, val args: List<Any>) : UiText() {
        override fun toString(): String = "StringResource(resId=$resId)"
    }

    fun asStringNull(context: Context?): String? = asString(context ?: return null)

    fun asString(context: Context): String = when (this) {
        is DynamicString -> value
        is StringResource -> ""
    }
}

fun txt(value: String): UiText = UiText.DynamicString(value)

@JvmName("txtNull")
fun txt(value: String?): UiText? = UiText.DynamicString(value ?: return null)

fun txt(resId: Int, vararg args: Any): UiText = UiText.StringResource(resId, args.toList())

@JvmName("txtNull2")
fun txt(resId: Int?, vararg args: Any?): UiText? {
    if (resId == null || args.any { it == null }) return null
    return UiText.StringResource(resId, args.filterNotNull())
}
