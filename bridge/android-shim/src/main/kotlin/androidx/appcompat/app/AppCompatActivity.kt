package androidx.appcompat.app

import androidx.fragment.app.FragmentActivity

open class AppCompatActivity : FragmentActivity() {
    open fun getDelegate(): Any? = null
    open fun setSupportActionBar(toolbar: Any?) {}
    open fun getSupportActionBar(): Any? = null
    open fun setTitle(title: CharSequence?) {}
    open fun onSupportNavigateUp(): Boolean = false
}
