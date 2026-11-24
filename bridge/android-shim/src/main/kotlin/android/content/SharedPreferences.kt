package android.content

import java.io.File

interface SharedPreferences {
    /** Kotlin extension analogue: `prefs.all` (android.content.SharedPreferences.all KTX); emits getAll() at bytecode level. */
    val all: Map<String, *>
    fun getString(key: String?, defValue: String?): String?
    fun getStringSet(key: String?, defValues: MutableSet<String>?): MutableSet<String>?
    fun getInt(key: String?, defValue: Int): Int
    fun getLong(key: String?, defValue: Long): Long
    fun getFloat(key: String?, defValue: Float): Float
    fun getBoolean(key: String?, defValue: Boolean): Boolean
    fun contains(key: String?): Boolean
    fun edit(): Editor

    interface Editor {
        fun putString(key: String?, value: String?): Editor
        fun putStringSet(key: String?, values: MutableSet<String>?): Editor
        fun putInt(key: String?, value: Int): Editor
        fun putLong(key: String?, value: Long): Editor
        fun putFloat(key: String?, value: Float): Editor
        fun putBoolean(key: String?, value: Boolean): Editor
        fun remove(key: String?): Editor
        fun clear(): Editor
        fun commit(): Boolean
        fun apply()
    }
}

/** JSON-file backed SharedPreferences. Lives under the host app's data dir. */
class FileSharedPreferences(private val dir: File, fileName: String) : SharedPreferences {
    private val file = File(dir, fileName.replace(Regex("[^A-Za-z0-9_.-]"), "_") + ".json")

    @Volatile
    private var values: MutableMap<String, Any?> = load()

    private fun load(): MutableMap<String, Any?> {
        return try {
            if (!file.exists()) return mutableMapOf()
            @Suppress("UNCHECKED_CAST")
            val parsed = com.fasterxml.jackson.databind.ObjectMapper().readValue(file, Map::class.java) as? Map<String, Any?>
            (parsed ?: emptyMap<String, Any?>()).toMutableMap()
        } catch (_: Throwable) {
            mutableMapOf()
        }
    }

    @Synchronized
    private fun persist() {
        try {
            dir.mkdirs()
            val tmp = File(dir, file.name + ".tmp")
            com.fasterxml.jackson.databind.ObjectMapper().writerWithDefaultPrettyPrinter().writeValue(tmp, values)
            tmp.renameTo(file)
        } catch (t: Throwable) {
            System.err.println("FileSharedPreferences: failed to persist ${file.name}: $t")
        }
    }

    @Synchronized
    override val all: Map<String, *>
        get() = LinkedHashMap(values)

    @Synchronized
    override fun getString(key: String?, defValue: String?): String? = values[key] as? String ?: defValue

    @Synchronized
    override fun getStringSet(key: String?, defValues: MutableSet<String>?): MutableSet<String>? {
        @Suppress("UNCHECKED_CAST")
        val set = values[key] as? List<*> ?: return defValues
        return set.filterIsInstance<String>().toMutableSet()
    }

    @Synchronized
    override fun getInt(key: String?, defValue: Int): Int = (values[key] as? Number)?.toInt() ?: defValue
    @Synchronized
    override fun getLong(key: String?, defValue: Long): Long = (values[key] as? Number)?.toLong() ?: defValue
    @Synchronized
    override fun getFloat(key: String?, defValue: Float): Float = (values[key] as? Number)?.toFloat() ?: defValue
    @Synchronized
    override fun getBoolean(key: String?, defValue: Boolean): Boolean = values[key] as? Boolean ?: defValue
    @Synchronized
    override fun contains(key: String?): Boolean = values.containsKey(key)

    override fun edit(): SharedPreferences.Editor = EditorImpl()

    private inner class EditorImpl : SharedPreferences.Editor {
        private val changes = LinkedHashMap<String, Any?>()
        private var clearAll = false

        override fun putString(key: String?, value: String?) = apply { changes[key.orEmpty()] = value }
        override fun putStringSet(key: String?, values: MutableSet<String>?) = apply { changes[key.orEmpty()] = values?.toList() }
        override fun putInt(key: String?, value: Int) = apply { changes[key.orEmpty()] = value }
        override fun putLong(key: String?, value: Long) = apply { changes[key.orEmpty()] = value }
        override fun putFloat(key: String?, value: Float) = apply { changes[key.orEmpty()] = value }
        override fun putBoolean(key: String?, value: Boolean) = apply { changes[key.orEmpty()] = value }
        override fun remove(key: String?) = apply { changes[key.orEmpty()] = REMOVED }
        override fun clear() = apply { clearAll = true }

        @Synchronized
        override fun commit(): Boolean {
            write()
            return true
        }

        override fun apply() {
            write()
        }

        private fun write() {
            synchronized(this@FileSharedPreferences) {
                if (clearAll) values.clear()
                for ((k, v) in changes) {
                    if (v === REMOVED) values.remove(k) else values[k] = v
                }
                clearAll = false
                changes.clear()
                persist()
            }
        }
    }

    private object REMOVED
}
