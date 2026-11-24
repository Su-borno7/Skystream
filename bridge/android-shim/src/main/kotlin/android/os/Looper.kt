package android.os

class Looper private constructor() {
    companion object {
        private val main = Looper()
        @JvmStatic
        fun getMainLooper(): Looper = main
        @JvmStatic
        fun myLooper(): Looper = main
        @JvmStatic
        fun prepare() {}
        @JvmStatic
        fun loop() {}
    }
    fun getThread(): Thread = Thread.currentThread()
    fun quit() {}
    fun quitSafely() {}
}
