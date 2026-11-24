package android.net

/** java.net.URI-backed Uri. */
class Uri private constructor(private val uri: java.net.URI?) {
    companion object {
        @JvmStatic
        fun parse(s: String?): Uri = Uri(try {
            if (s.isNullOrBlank()) null else java.net.URI(s)
        } catch (_: Throwable) {
            try { s?.let { java.net.URI(it.replace(" ", "%20")) } } catch (_: Throwable) { null }
        })

        @JvmStatic
        fun fromFile(file: java.io.File): Uri = parse(file.toURI().toString())

        @JvmStatic
        fun fromParts(scheme: String?, ssp: String?, fragment: String?): Uri =
            parse(listOfNotNull(scheme?.let { "$it:$ssp" }, fragment?.let { "#$it" }).joinToString(""))

        @JvmStatic
        fun buildUpon(base: String): Builder = Builder(base)

        private fun encodeComponent(value: String): String =
            java.net.URLEncoder.encode(value, Charsets.UTF_8).replace("+", "%20")
    }

    class Builder(private var base: String) {
        fun appendPath(segment: String): Builder = apply { base = base.trimEnd('/') + "/" + encodeComponent(segment) }
        fun appendEncodedPath(path: String): Builder = apply { base = base.trimEnd('/') + "/" + path }
        fun appendQueryParameter(key: String, value: String): Builder = apply {
            base += if (base.contains("?")) "&" else "?"
            base += "${encodeComponent(key)}=${encodeComponent(value)}"
        }
        fun clearQuery(): Builder = apply { base = base.substringBefore("?") }
        fun scheme(scheme: String): Builder = apply { base = if (base.contains("://")) scheme + base.substring(base.indexOf("://")) else "$scheme:$base" }
        fun build(): Uri = parse(base)
    }

    fun getScheme(): String? = uri?.scheme
    fun getHost(): String? = uri?.host
    fun getAuthority(): String? = uri?.authority
    fun getPath(): String? = uri?.path
    fun getQuery(): String? = uri?.rawQuery
    fun getFragment(): String? = uri?.fragment
    fun getLastPathSegment(): String? = uri?.path?.trim('/')?.substringAfterLast('/')
    fun getUserInfo(): String? = uri?.userInfo
    fun getPort(): Int = uri?.port ?: -1
    fun isAbsolute(): Boolean = uri?.isAbsolute ?: false

    fun getQueryParameter(key: String): String? {
        val q = uri?.rawQuery ?: return null
        for (pair in q.split('&')) {
            val idx = pair.indexOf('=')
            val name = if (idx >= 0) pair.substring(0, idx) else pair
            if (java.net.URLDecoder.decode(name, Charsets.UTF_8) == key) {
                return if (idx >= 0) java.net.URLDecoder.decode(pair.substring(idx + 1), Charsets.UTF_8) else ""
            }
        }
        return null
    }

    fun getQueryParameters(key: String): List<String> {
        val q = uri?.rawQuery ?: return emptyList()
        return q.split('&').mapNotNull { pair ->
            val idx = pair.indexOf('=')
            val name = if (idx >= 0) pair.substring(0, idx) else pair
            if (java.net.URLDecoder.decode(name, Charsets.UTF_8) == key) {
                if (idx >= 0) java.net.URLDecoder.decode(pair.substring(idx + 1), Charsets.UTF_8) else ""
            } else null
        }
    }

    fun getQueryParameterNames(): Set<String> =
        uri?.rawQuery?.split('&')?.map { it.substringBefore('=') }?.map { java.net.URLDecoder.decode(it, Charsets.UTF_8) }?.toSet()
            ?: emptySet()

    fun buildUpon(): Builder = Builder(toString())
    override fun toString(): String = uri?.toString() ?: ""
    fun equals(other: Uri?): Boolean = other != null && other.toString() == toString()
    override fun hashCode(): Int = toString().hashCode()
}
