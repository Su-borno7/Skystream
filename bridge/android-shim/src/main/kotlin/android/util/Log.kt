package android.util

/** Minimal android.util.Log: routes to stdout/stderr so plugin logs land in bridge logs. */
object Log {
    const val VERBOSE = 2
    const val DEBUG = 3
    const val INFO = 4
    const val WARN = 5
    const val ERROR = 6

    @JvmStatic
    fun v(tag: String?, msg: String?) = println("V/$tag: $msg")
    @JvmStatic
    fun d(tag: String?, msg: String?) = println("D/$tag: $msg")
    @JvmStatic
    fun i(tag: String?, msg: String?) = println("I/$tag: $msg")
    @JvmStatic
    fun w(tag: String?, msg: String?) = System.err.println("W/$tag: $msg")
    @JvmStatic
    fun e(tag: String?, msg: String?) = System.err.println("E/$tag: $msg")
    @JvmStatic
    fun e(tag: String?, msg: String?, tr: Throwable?) {
        System.err.println("E/$tag: $msg")
        tr?.printStackTrace()
    }
    @JvmStatic
    fun v(tag: String?, msg: String?, tr: Throwable?) = logWith("V", tag, msg, tr)
    @JvmStatic
    fun d(tag: String?, msg: String?, tr: Throwable?) = logWith("D", tag, msg, tr)
    @JvmStatic
    fun i(tag: String?, msg: String?, tr: Throwable?) = logWith("I", tag, msg, tr)
    @JvmStatic
    fun w(tag: String?, msg: String?, tr: Throwable?) = logWith("W", tag, msg, tr)

    private fun logWith(level: String, tag: String?, msg: String?, tr: Throwable?) {
        println("$level/$tag: $msg")
        tr?.printStackTrace(System.out)
    }

    @JvmStatic
    fun isLoggable(tag: String?, level: Int): Boolean = true
}
