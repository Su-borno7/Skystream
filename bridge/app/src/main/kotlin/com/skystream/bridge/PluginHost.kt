package com.skystream.bridge

import com.fasterxml.jackson.databind.ObjectMapper
import com.lagradost.cloudstream3.APIHolder
import com.lagradost.cloudstream3.MainAPI
import com.lagradost.cloudstream3.plugins.Plugin
import java.io.ByteArrayInputStream
import java.io.File
import java.io.InputStream
import java.net.URLClassLoader
import java.security.MessageDigest
import java.util.concurrent.CopyOnWriteArrayList
import java.util.zip.ZipInputStream

/**
 * Loads CloudStream `.cs3` extensions (dex bytecode) onto the JVM.
 *
 * The extension API (com.lagradost.cloudstream3.*) is the real upstream library
 * compiled for JVM, the Android framework is replaced by android-shim, and the
 * plugin classes themselves are translated dex → JVM bytecode with dex2jar
 * (cached on disk by file hash).
 */
class PluginHost(private val cacheDir: File) {

    data class PluginRef(val internalName: String, val filePath: String)
    data class Failure(val internalName: String, val error: String)
    data class Loaded(
        val internalName: String,
        val manifestName: String?,
        val manifestVersion: Int?,
        val pluginClassName: String?,
        val requiresResources: Boolean,
        val providers: List<MainAPI>,
        val plugin: Plugin,
    )

    private val mapper = ObjectMapper()

    /** Currently loaded plugins (reload replaces the whole set). */
    @Volatile
    var loaded: List<Loaded> = emptyList()
        private set

    val allProviders: List<MainAPI>
        get() = loaded.flatMap { it.providers }

    fun findProvider(nameOrMainUrl: String): MainAPI? =
        allProviders.firstOrNull { it.name.equals(nameOrMainUrl, ignoreCase = true) }
            ?: allProviders.firstOrNull { it.mainUrl.trimEnd('/') == nameOrMainUrl.trimEnd('/') }

    /** Translate the dex payload of a .cs3 to a JVM jar, using the on-disk cache. */
    private fun translatedJar(cs3: File): File {
        val sha = sha256Hex(cs3)
        val target = File(cacheDir, "translated/$sha.jar")
        if (target.exists() && target.length() > 0) return target
        target.parentFile.mkdirs()
        val tmpDir = File(cacheDir, "classes/$sha")
        if (tmpDir.exists()) tmpDir.deleteRecursively()
        tmpDir.mkdirs()
        var found = 0
        ZipInputStream(cs3.inputStream().buffered()).use { zip ->
            var entry = zip.nextEntry
            while (entry != null) {
                val name = entry.name
                if (!entry.isDirectory && Regex("classes(\\d*)?\\.dex").matches(File(name).name)) {
                    val dexBytes = zip.readBytes()
                    val dexFile = File(tmpDir, File(name).name)
                    dexFile.writeBytes(dexBytes)
                    com.googlecode.d2j.dex.Dex2jar.from(dexFile)
                        .withExceptionHandler(com.googlecode.d2j.dex.BaseDexExceptionHandler())
                        .topoLogicalSort()
                        .to(tmpDir.toPath()) // directory: writes <class>.class files
                    found++
                }
                entry = zip.nextEntry
            }
        }
        if (found == 0) throw IllegalStateException("No classes.dex found in ${cs3.name}")
        // jar the translated .class files
        jarDir(tmpDir, target)
        tmpDir.deleteRecursively()
        return target
    }

    private fun jarDir(dir: File, target: File) {
        target.parentFile.mkdirs()
        val tmp = File.createTempFile("plugin", ".jar", target.parentFile)
        java.util.jar.JarOutputStream(tmp.outputStream().buffered()).use { jar ->
            for (file in dir.walkTopDown().filter { it.isFile }) {
                val rel = file.relativeTo(dir).invariantSeparatorsPath
                if (rel.startsWith("classes") && rel.endsWith(".dex")) continue // skip raw dex
                jar.putNextEntry(java.util.jar.JarEntry(rel))
                file.inputStream().use { it.copyTo(jar) }
                jar.closeEntry()
            }
        }
        if (!tmp.renameTo(target)) {
            tmp.copyTo(target, overwrite = true)
            tmp.delete()
        }
    }

    private fun sha256Hex(file: File): String {
        val md = MessageDigest.getInstance("SHA-256")
        file.inputStream().buffered().use { input ->
            val buf = ByteArray(64 * 1024)
            while (true) {
                val n = input.read(buf)
                if (n <= 0) break
                md.update(buf, 0, n)
            }
        }
        return md.digest().joinToString("") { "%02x".format(it) }
    }

    private class ManifestInfo(
        val name: String?,
        val pluginClassName: String?,
        val version: Int?,
        val requiresResources: Boolean,
    )

    private fun readManifest(cs3: File): ManifestInfo {
        ZipInputStream(cs3.inputStream().buffered()).use { zip ->
            var entry = zip.nextEntry
            while (entry != null) {
                if (!entry.isDirectory && entry.name == "manifest.json") {
                    val bytes = zip.readBytes()
                    val node = mapper.readTree(bytes)
                    val requiresResources = node.path("requiresResources").asBoolean(false)
                    return ManifestInfo(
                        name = node.path("name").asText(null),
                        pluginClassName = node.path("pluginClassName").asText(null),
                        version = if (node.path("version").isNumber) node.path("version").asInt() else null,
                        requiresResources = requiresResources,
                    )
                }
                entry = zip.nextEntry
            }
        }
        throw IllegalStateException("manifest.json not found in ${cs3.name}")
    }

    /** Unload everything, then load the given plugin set. */
    @Synchronized
    fun reload(refs: List<PluginRef>): Pair<List<Loaded>, List<Failure>> {
        unloadAll()
        val newLoaded = mutableListOf<Loaded>()
        val failures = mutableListOf<Failure>()
        for (ref in refs) {
            try {
                newLoaded.add(loadOne(ref))
            } catch (t: Throwable) {
                t.printStackTrace()
                failures.add(Failure(ref.internalName, t.message ?: t.javaClass.name))
            }
        }
        loaded = newLoaded
        return newLoaded to failures
    }

    private fun loadOne(ref: PluginRef): Loaded {
        val cs3 = File(ref.filePath)
        if (!cs3.exists() || !cs3.isFile) throw IllegalStateException("Plugin file not found: ${ref.filePath}")
        val manifest = readManifest(cs3)
        if (manifest.requiresResources) {
            throw IllegalStateException("Plugin requires resources (arsc) — not supported by the desktop bridge")
        }
        val className = manifest.pluginClassName
            ?: throw IllegalStateException("manifest.json has no pluginClassName")

        val before = APIHolder.allProviders.toList()
        val beforeExtractors = com.lagradost.cloudstream3.utils.extractorApis.toList()

        val jar = translatedJar(cs3)
        val parent = Plugin::class.java.classLoader
        val loader = URLClassLoader(arrayOf(jar.toURI().toURL()), parent)

        val clazz = try {
            loader.loadClass(className)
        } catch (e: ClassNotFoundException) {
            throw IllegalStateException("Plugin class $className not found after dex translation", e)
        } catch (e: Throwable) {
            throw IllegalStateException("Failed to load plugin class $className: ${e.message}", e)
        }

        val instance = try {
            clazz.getDeclaredConstructor().newInstance()
        } catch (e: Throwable) {
            throw IllegalStateException("Failed to instantiate $className: ${e.message}", e)
        }
        val plugin = instance as? Plugin
            ?: throw IllegalStateException("$className is not a com.lagradost.cloudstream3.plugins.Plugin")

        plugin.filename = ref.internalName
        val context = com.lagradost.cloudstream3.CloudStreamApp.context
            ?: throw IllegalStateException("Bridge context not initialised")
        try {
            plugin.load(context)
        } catch (e: Throwable) {
            throw IllegalStateException("Plugin load() threw: ${e.message ?: e.javaClass.name}", e)
        }

        val newProviders = APIHolder.allProviders.toList() - before.toSet()
        val newExtractors = com.lagradost.cloudstream3.utils.extractorApis.toList() - beforeExtractors.toSet()
        for (provider in newProviders) provider.sourcePlugin = ref.internalName
        for (extractor in newExtractors) extractor.sourcePlugin = ref.internalName
        println("I/Skystream: ${ref.internalName} registered ${newProviders.size} provider(s), ${newExtractors.size} extractor(s)")

        return Loaded(
            internalName = ref.internalName,
            manifestName = manifest.name,
            manifestVersion = manifest.version,
            pluginClassName = className,
            requiresResources = manifest.requiresResources,
            providers = newProviders,
            plugin = plugin,
        )
    }

    @Synchronized
    fun unloadAll() {
        val current = loaded
        if (current.isNotEmpty()) {
            val toRemove = current.flatMap { it.providers }.toSet()
            APIHolder.allProviders.withLock { removeAll(toRemove) }
            for (loadedPlugin in current) {
                try {
                    loadedPlugin.plugin.beforeUnload()
                } catch (t: Throwable) {
                    System.err.println("W/Skystream: beforeUnload for ${loadedPlugin.internalName} failed: $t")
                }
            }
        }
        loaded = emptyList()
    }
}
