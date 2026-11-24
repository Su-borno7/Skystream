package android.os

object SystemClock {
    @JvmStatic
    fun uptimeMillis(): Long = System.nanoTime() / 1_000_000
    @JvmStatic
    fun elapsedRealtime(): Long = uptimeMillis()
    @JvmStatic
    fun currentThreadTimeMillis(): Long = System.currentTimeMillis()
    @JvmStatic
    fun currentTimeMillis(): Long = System.currentTimeMillis()
}
