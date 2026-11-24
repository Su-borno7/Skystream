package android.content.res

class AssetManager {
    fun open(fileName: String?): java.io.InputStream = throw java.io.FileNotFoundException(fileName)
    fun open(fileName: String?, accessMode: Int): java.io.InputStream = throw java.io.FileNotFoundException(fileName)
    fun list(path: String?): Array<String> = emptyArray()
    fun openXmlResourceParser(fileName: String?): Nothing = throw java.io.FileNotFoundException(fileName)
}
