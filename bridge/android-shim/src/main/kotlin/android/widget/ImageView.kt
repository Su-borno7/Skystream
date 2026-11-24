package android.widget

import android.view.View

open class ImageView @JvmOverloads constructor(context: android.content.Context? = null) : View(context) {
    open fun setImageBitmap(bitmap: android.graphics.Bitmap?) {}
    open fun setImageDrawable(drawable: android.graphics.drawable.Drawable?) {}
    open fun setImageResource(resId: Int) {}
}
