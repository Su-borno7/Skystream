package androidx.fragment.app

import android.content.Context

open class Fragment {
    open fun isAdded(): Boolean = true
    open fun isDetached(): Boolean = false
    open fun isRemoving(): Boolean = false
    open fun isHidden(): Boolean = false
    open fun getContext(): Context? = android.content.SkystreamHost.applicationContext
    open fun getActivity(): android.app.Activity? = null
    open fun requireContext(): Context = getContext()!!
    open fun onCreate(savedInstanceState: Any?) {}
    open fun onDestroy() {}
    open fun onDestroyView() {}
    open fun onStart() {}
    open fun onStop() {}
    open fun onResume() {}
    open fun onPause() {}
}

open class FragmentActivity : android.app.Activity() {
    private val fragmentManager = FragmentManager()

    @Suppress("UNUSED_PARAMETER")
    open fun getSupportFragmentManager(): FragmentManager = fragmentManager

    open fun supportFragmentManager(): FragmentManager = fragmentManager
}

open class FragmentManager {
    open fun beginTransaction(): FragmentTransaction = FragmentTransaction()
    open fun findFragmentByTag(tag: String?): Fragment? = null
    open fun findFragmentById(id: Int): Fragment? = null
    open fun isDestroyed(): Boolean = false
    open fun isStateSaved(): Boolean = false
    open fun executePendingTransactions(): Boolean = true
    open fun popBackStack(): Boolean = true
    open fun getBackStackEntryCount(): Int = 0
    open fun addOnBackStackChangedListener(listener: Any?) {}
    open fun removeOnBackStackChangedListener(listener: Any?) {}
    open fun getFragments(): List<Fragment> = emptyList()
}

open class FragmentTransaction {
    open fun add(fragment: Fragment?, tag: String?): FragmentTransaction = this
    open fun add(containerViewId: Int, fragment: Fragment?): FragmentTransaction = this
    open fun add(containerViewId: Int, fragment: Fragment?, tag: String?): FragmentTransaction = this
    open fun replace(containerViewId: Int, fragment: Fragment?): FragmentTransaction = this
    open fun replace(containerViewId: Int, fragment: Fragment?, tag: String?): FragmentTransaction = this
    open fun remove(fragment: Fragment?): FragmentTransaction = this
    open fun hide(fragment: Fragment?): FragmentTransaction = this
    open fun show(fragment: Fragment?): FragmentTransaction = this
    open fun detach(fragment: Fragment?): FragmentTransaction = this
    open fun attach(fragment: Fragment?): FragmentTransaction = this
    open fun addToBackStack(name: String?): FragmentTransaction = this
    open fun setCustomAnimations(enter: Int, exit: Int): FragmentTransaction = this
    open fun setTransition(transition: Int): FragmentTransaction = this
    open fun commit(): Int = 0
    open fun commitAllowingStateLoss(): Int = 0
    open fun commitNow(): Boolean = true
    open fun commitNowAllowingStateLoss(): Boolean = true
    open fun commitNow(now: Boolean): Int = 0
    open fun setReorderingAllowed(reorderingAllowed: Boolean): FragmentTransaction = this
}

open class DialogFragment : Fragment() {
    open fun setCancelable(cancelable: Boolean) {}
    open fun isCancelable(): Boolean = true
    open fun setArguments(args: Any?) {}
    open fun onCreateDialog(savedInstanceState: Any?): android.app.Dialog? = null
    open fun onDismiss(dialog: Any?) {}
    open fun show(manager: FragmentManager?, tag: String?) {}
    open fun dismiss() {}
    open fun dismissAllowingStateLoss() {}
}
