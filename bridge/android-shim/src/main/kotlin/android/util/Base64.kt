package android.util

/** android.util.Base64 on top of java.util.Base64. */
object Base64 {
    const val DEFAULT = 0
    const val NO_PADDING = 1
    const val NO_WRAP = 2
    const val CRLF = 4
    const val URL_SAFE = 8
    const val NO_CLOSE = 16
    const val MIME_COMPATIBLE = 32
    const val URL_SAFE_NO_WRAP = URL_SAFE or NO_PADDING or NO_WRAP

    @JvmStatic
    fun decode(str: String?, flags: Int = DEFAULT): ByteArray {
        if (str == null) return ByteArray(0)
        val cleaned = if (flags and URL_SAFE != 0) {
            str.replace('-', '+').replace('_', '/')
        } else str
        val noPad = if (flags and NO_PADDING != 0) cleaned.trimEnd('=') else cleaned
        return java.util.Base64.getDecoder().decode(pad(noPad))
    }

    @JvmStatic
    fun decode(input: ByteArray, flags: Int = DEFAULT): ByteArray = decode(String(input, Charsets.US_ASCII), flags)

    @JvmStatic
    fun encodeToString(input: ByteArray, flags: Int = DEFAULT): String {
        val encoder = if (flags and URL_SAFE != 0) java.util.Base64.getUrlEncoder() else java.util.Base64.getEncoder()
        val out = encoder.encodeToString(input)
        return if (flags and NO_WRAP != 0) out.replace("\n", "") else out
    }

    @JvmStatic
    fun encode(input: ByteArray, flags: Int = DEFAULT): ByteArray =
        encodeToString(input, flags).toByteArray(Charsets.US_ASCII)

    private fun pad(s: String): String {
        val mod = s.length % 4
        return when (mod) {
            0 -> s
            2 -> s + "=="
            3 -> s + "="
            else -> s + "=".repeat(4 - mod)
        }
    }
}
