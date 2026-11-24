package android.util

/** android.util.LruCache backed by a LinkedHashMap with access order. */
open class LruCache<K, V>(maxSize: Int) {
    private val limit = maxOf(1, maxSize)
    private var size = 0

    private val map = object : LinkedHashMap<K, V>(0, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<K, V>): Boolean {
            val over = size > limit
            if (over) size -= safeSizeOf(eldest.key, eldest.value)
            return over
        }
    }

    @Synchronized
    open fun sizeOf(key: K, value: V): Int = 1

    private fun safeSizeOf(key: K, value: V): Int = try { sizeOf(key, value) } catch (_: Throwable) { 1 }

    @Synchronized
    open fun maxSize(): Int = limit

    @Synchronized
    open fun size(): Int = size

    @Synchronized
    open fun get(key: K): V? {
        val value = map[key] ?: return null
        return value
    }

    @Synchronized
    open fun put(key: K, value: V): V? {
        val previous = map.put(key, value)
        size += safeSizeOf(key, value)
        if (previous != null) size -= safeSizeOf(key, previous)
        trimToSize(limit)
        return previous
    }

    @Synchronized
    open fun remove(key: K): V? {
        val value = map.remove(key) ?: return null
        size -= safeSizeOf(key, value)
        return value
    }

    @Synchronized
    open fun evictAll() {
        map.clear()
        size = 0
    }

    @Synchronized
    open fun snapshot(): Map<K, V> = LinkedHashMap(map)

    @Synchronized
    open fun trimToSize(maxSize: Int) {
        while (size > maxSize && map.isNotEmpty()) {
            val eldest = map.entries.iterator().next()
            size -= safeSizeOf(eldest.key, eldest.value)
            map.remove(eldest.key)
        }
    }
}
