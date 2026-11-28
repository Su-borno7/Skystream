package android.os

import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/** Handler that executes tasks on a shared daemon scheduler (headless host). */
open class Handler @JvmOverloads constructor(looper: Looper? = null, callback: Callback? = null) {
    fun interface Callback {
        fun handleMessage(msg: Message): Boolean
    }

    class Message {
        var what: Int = 0
        var arg1: Int = 0
        var arg2: Int = 0
        var obj: Any? = null
        var replyTo: Handler? = null
        fun sendToTarget(): Boolean = replyTo?.sendMessage(this) ?: false
    }

    companion object {
        private val scheduler = Executors.newScheduledThreadPool(2) { runnable ->
            Thread(runnable, "cinelab-handler").apply { isDaemon = true }
        }
    }

    private val pending = mutableListOf<ScheduledFuture<*>>()

    open fun post(r: Runnable): Boolean {
        scheduler.execute(r)
        return true
    }

    open fun postDelayed(r: Runnable, delayMillis: Long): Boolean {
        synchronized(pending) { pending.add(scheduler.schedule(r, delayMillis, TimeUnit.MILLISECONDS)) }
        return true
    }

    open fun postAtTime(r: Runnable, uptimeMillis: Long): Boolean =
        postDelayed(r, maxOf(0L, uptimeMillis - SystemClock.uptimeMillis()))

    open fun removeCallbacks(r: Runnable) {
        synchronized(pending) {
            pending.forEach { it.cancel(false) }
            pending.clear()
        }
    }

    open fun removeCallbacksAndMessages(token: Any?) {
        synchronized(pending) {
            pending.forEach { it.cancel(false) }
            pending.clear()
        }
    }

    open fun removeMessages(what: Int) {}

    fun sendMessage(msg: Message): Boolean = true
    fun sendEmptyMessage(what: Int): Boolean = true
    fun sendEmptyMessageDelayed(what: Int, delayMillis: Long): Boolean = true
    fun hasMessages(what: Int): Boolean = false
    fun handleMessage(msg: Message) {}
    open fun dispatchMessage(msg: Message) {}
}
