package android.webkit

/** In-memory cookie jar shared by all plugins (per JVM session). */
class CookieManager private constructor() {
    private val cookies = LinkedHashMap<String, MutableMap<String, String>>()

    companion object {
        private val INSTANCE = CookieManager()
        @JvmStatic
        fun getInstance(): CookieManager = INSTANCE
    }

    @Synchronized
    fun setCookie(url: String?, value: String?) {
        if (url.isNullOrBlank() || value.isNullOrBlank()) return
        val origin = originOf(url) ?: return
        val jar = cookies.getOrPut(origin) { LinkedHashMap() }
        for (part in value.split(';')) {
            val idx = part.indexOf('=')
            if (idx <= 0) continue
            val key = part.substring(0, idx).trim()
            val v = part.substring(idx + 1).trim()
            // skip cookie attributes
            if (key.equals("path", true) || key.equals("domain", true) || key.equals("expires", true)
                || key.equals("max-age", true) || key.equals("samesite", true) || key.equals("secure", true)
                || key.equals("httponly", true)) continue
            jar[key] = v
        }
    }

    @Synchronized
    fun getCookie(url: String?): String? {
        if (url.isNullOrBlank()) return null
        val origin = originOf(url) ?: return null
        val jar = cookies[origin] ?: return null
        if (jar.isEmpty()) return null
        return jar.entries.joinToString("; ") { "${it.key}=${it.value}" }
    }

    @Synchronized
    fun getCookie(url: String?, valueCallback: Any?) {
        // legacy async API: deliver synchronously via reflection-free callback if simple
    }

    fun flush() {}
    fun setAcceptCookie(accept: Boolean) {}
    fun setAcceptThirdPartyCookies(webView: Any?, accept: Boolean) {}
    fun removeAllCookies(callback: Any?) {}
    fun removeSessionCookies(callback: Any?) {}
    fun hasCookies(): Boolean = cookies.isNotEmpty()
    fun acceptCookie(): Boolean = true

    @Synchronized
    fun removeAllCookie(url: String?) {
        val origin = originOf(url ?: return) ?: return
        cookies.remove(origin)
    }

    private fun originOf(url: String): String? = try {
        val uri = java.net.URI(url)
        val host = uri.host ?: return null
        val scheme = uri.scheme ?: "https"
        "$scheme://$host"
    } catch (_: Throwable) { null }
}
