package android.content

open class Intent @JvmOverloads constructor(
    val action: String? = null,
    var data: android.net.Uri? = null,
) {
    var flags: Int = 0
        private set

    private val extras = HashMap<String, Any?>()

    constructor(packageContext: Context?, cls: Class<*>?) : this(null, null)

    fun setFlags(flags: Int): Intent = apply { this.flags = flags }
    fun addFlags(flags: Int): Intent = apply { this.flags = this.flags or flags }
    fun setData(uri: android.net.Uri?): Intent = apply { this.data = uri }
    fun getAction(): String? = action
    fun getData(): android.net.Uri? = data
    fun setPackage(packageName: String?): Intent = this
    fun putExtra(name: String, value: String?): Intent = apply { extras[name] = value }
    fun putExtra(name: String, value: Int): Intent = apply { extras[name] = value }
    fun putExtra(name: String, value: Boolean): Intent = apply { extras[name] = value }
    fun putExtra(name: String, value: Long): Intent = apply { extras[name] = value }
    fun getStringExtra(name: String): String? = extras[name] as? String
    fun getIntExtra(name: String, defaultValue: Int): Int = extras[name] as? Int ?: defaultValue
    fun getBooleanExtra(name: String, defaultValue: Boolean): Boolean = extras[name] as? Boolean ?: defaultValue
    fun addCategory(category: String): Intent = this
    fun setType(type: String?): Intent = this
    fun setClipData(clip: Any?): Intent = this
    override fun toString(): String = "Intent(action=$action, data=$data, flags=$flags)"
}

class ComponentName(val packageName: String, val className: String)
