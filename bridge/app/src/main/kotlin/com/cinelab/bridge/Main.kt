package com.cinelab.bridge

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.SerializationFeature
import com.lagradost.cloudstream3.AnimeLoadResponse
import com.lagradost.cloudstream3.CloudStreamApp
import com.lagradost.cloudstream3.MainAPI
import com.lagradost.cloudstream3.MainPageRequest
import com.lagradost.cloudstream3.SearchResponseList
import com.lagradost.cloudstream3.SubtitleFile
import com.lagradost.cloudstream3.utils.ExtractorLink
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import java.io.File
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import java.util.concurrent.locks.ReentrantLock

/**
 * Cinelab bridge — loads CloudStream `.cs3` extensions and serves the parts
 * of their API that the desktop app needs over loopback HTTP/JSON.
 *
 * Usage: java com.cinelab.bridge.Main [userDataDir]
 * Prints `CINELAB_PORT=<port>` on stdout when ready.
 */
object Main {

    private val mapper = ObjectMapper().apply {
        disable(SerializationFeature.FAIL_ON_EMPTY_BEANS)
    }

    @JvmStatic
    fun main(args: Array<String>) {
        val userDataDir = File(
            args.getOrNull(0)
                ?: System.getProperty("cinelab.userdata")
                ?: File(System.getProperty("user.home"), ".cinelab-bridge").absolutePath
        )
        userDataDir.mkdirs()
        val cacheDir = File(System.getProperty("cinelab.cache.dir") ?: File(userDataDir, "cache").absolutePath)
        cacheDir.mkdirs()

        // Headless host context for the extension API (prefs store, cache dirs, ...)
        CloudStreamApp.init(CloudStreamApp(), userDataDir)

        val host = PluginHost(cacheDir)
        val pluginLock = ReentrantLock()
        val startNanos = System.nanoTime()

        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.executor = Executors.newCachedThreadPool { r -> Thread(r, "cinelab-http").apply { isDaemon = true } }

        fun json(exchange: HttpExchange, status: Int, body: Any?) {
            val bytes = mapper.writeValueAsBytes(body)
            exchange.responseHeaders.set("Content-Type", "application/json; charset=utf-8")
            exchange.responseHeaders.set("Access-Control-Allow-Origin", "*")
            exchange.responseHeaders.set("Cache-Control", "no-store")
            exchange.sendResponseHeaders(status, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }

        fun error(exchange: HttpExchange, status: Int, message: String) =
            json(exchange, status, mapOf("error" to message))

        fun readBody(exchange: HttpExchange): Map<*, *> {
            val text = exchange.requestBody.readBytes().toString(StandardCharsets.UTF_8).trim()
            if (text.isEmpty()) return emptyMap<Any?, Any?>()
            return mapper.readValue(text, Map::class.java) ?: emptyMap<Any?, Any?>()
        }

        fun providerFrom(body: Map<*, *>): MainAPI {
            val name = body["provider"] as? String
                ?: throw IllegalArgumentException("missing 'provider'")
            return host.findProvider(name)
                ?: throw IllegalArgumentException("No provider '$name' is loaded — reload plugins first")
        }

        fun providersJson(): List<Map<String, Any?>> =
            host.loaded.flatMap { loadedPlugin ->
                loadedPlugin.providers.map { Serialize.provider(loadedPlugin.internalName, it) }
            }

        fun handle(exchange: HttpExchange) {
            val path = exchange.requestURI?.rawPath ?: "/"
            val method = exchange.requestMethod ?: "GET"
            try {
                when {
                    method == "GET" && path == "/health" ->
                        json(exchange, 200, mapOf(
                            "ok" to true,
                            "uptimeMs" to TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startNanos),
                            "providers" to host.allProviders.size,
                            "loaded" to host.loaded.map { it.internalName },
                        ))

                    method == "GET" && path == "/providers" ->
                        json(exchange, 200, mapOf("providers" to providersJson()))

                    method == "POST" && path == "/reload" -> {
                        val body = readBody(exchange)
                        @Suppress("UNCHECKED_CAST")
                        val plugins = (body["plugins"] as? List<Map<String, Any?>>) ?: emptyList()
                        val refs = plugins.map { p ->
                            PluginHost.PluginRef(
                                internalName = (p["internalName"] as? String)?.takeIf { it.isNotBlank() }
                                    ?: throw IllegalArgumentException("plugin entry missing internalName"),
                                filePath = (p["filePath"] as? String)
                                    ?: throw IllegalArgumentException("plugin entry missing filePath"),
                            )
                        }
                        val (loaded, failed) = pluginLock.withLockCompat {
                            host.reload(refs)
                        }
                        json(exchange, 200, mapOf(
                            "loaded" to loaded.map { it.internalName },
                            "failed" to failed.map { mapOf("internalName" to it.internalName, "error" to it.error) },
                            "providers" to providersJson(),
                        ))
                    }

                    method == "POST" && path == "/home" -> {
                        val body = readBody(exchange)
                        val provider = providerFrom(body)
                        val page = (body["page"] as? Number)?.toInt() ?: 1
                        val lists = pluginLock.withLockCompat {
                            provider.mainPage.map { section ->
                                val request = MainPageRequest(section.name, section.data, section.horizontalImages)
                                runCatching {
                                    val response = runBlocking {
                                        withTimeout(60_000) { provider.getMainPage(page, request) }
                                    }
                                    if (response == null) {
                                        mapOf("name" to section.name, "horizontalImages" to section.horizontalImages, "error" to "plugin returned null")
                                    } else mapOf(
                                        "name" to section.name,
                                        "horizontalImages" to section.horizontalImages,
                                        "hasNext" to response.hasNext,
                                        "rows" to response.items.map { row ->
                                            mapOf(
                                                "name" to row.name,
                                                "isHorizontalImages" to row.isHorizontalImages,
                                                "items" to row.list.map(Serialize::searchResponse),
                                            )
                                        },
                                    )
                                }.getOrElse { t ->
                                    mapOf("name" to section.name, "horizontalImages" to section.horizontalImages, "error" to (t.message ?: t.javaClass.name))
                                }
                            }
                        }
                        json(exchange, 200, mapOf("provider" to provider.name, "page" to page, "lists" to lists))
                    }

                    method == "POST" && path == "/search" -> {
                        val body = readBody(exchange)
                        val provider = providerFrom(body)
                        val query = (body["query"] as? String)?.trim()
                            ?: throw IllegalArgumentException("missing 'query'")
                        val page = (body["page"] as? Number)?.toInt() ?: 1
                        val result = pluginLock.withLockCompat {
                            runBlocking {
                                withTimeout(60_000) { provider.search(query, page) }
                            }
                        }
                        val items: List<*> = when (result) {
                            null -> emptyList<Any>()
                            is SearchResponseList -> result.items
                            else -> emptyList<Any>()
                        }
                        @Suppress("UNCHECKED_CAST")
                        val serialized = (items as List<com.lagradost.cloudstream3.SearchResponse>)
                            .map(Serialize::searchResponse)
                        json(exchange, 200, mapOf(
                            "provider" to provider.name,
                            "query" to query,
                            "page" to page,
                            "hasNext" to ((result as? SearchResponseList)?.hasNext ?: false),
                            "items" to serialized,
                        ))
                    }

                    method == "POST" && path == "/load" -> {
                        val body = readBody(exchange)
                        val provider = providerFrom(body)
                        val url = (body["url"] as? String)
                            ?: throw IllegalArgumentException("missing 'url'")
                        val response = pluginLock.withLockCompat {
                            runBlocking {
                                withTimeout(60_000) { provider.load(url) }
                            }
                        } ?: throw IllegalStateException("plugin returned null for load($url)")
                        json(exchange, 200, Serialize.loadResponse(response))
                    }

                    method == "POST" && path == "/loadlinks" -> {
                        val body = readBody(exchange)
                        val provider = providerFrom(body)
                        val data = (body["data"] as? String)
                            ?: throw IllegalArgumentException("missing 'data'")
                        val links = ConcurrentLinkedQueue<ExtractorLink>()
                        val subtitles = ConcurrentLinkedQueue<SubtitleFile>()
                        pluginLock.withLockCompat {
                            runBlocking {
                                withTimeout(120_000) {
                                    provider.loadLinks(
                                        data = data,
                                        isCasting = false,
                                        subtitleCallback = { subtitles.add(it) },
                                        callback = { links.add(it) },
                                    )
                                }
                            }
                        }
                        json(exchange, 200, mapOf(
                            "provider" to provider.name,
                            "links" to links.map(Serialize::extractorLink),
                            "subtitles" to subtitles.map(Serialize::subtitleFile),
                        ))
                    }

                    method == "POST" && path == "/shutdown" -> {
                        json(exchange, 200, mapOf("ok" to true))
                        Thread { runCatching { server.stop(0) } }.start()
                    }

                    else -> error(exchange, 404, "unknown endpoint: $method $path")
                }
            } catch (t: Throwable) {
                val message = t.message ?: t.javaClass.name
                t.printStackTrace()
                runCatching { error(exchange, 500, message) }
            } finally {
                runCatching { exchange.close() }
            }
        }

        server.createContext("/") { exchange -> handle(exchange) }
        server.start()
        val port = server.address.port
        println("CINELAB_PORT=$port")
        System.out.flush()
        println("I/Cinelab: bridge ready (userDataDir=${userDataDir.absolutePath})")
        System.out.flush()
    }

    private inline fun <T> ReentrantLock.withLockCompat(block: () -> T): T {
        lock()
        return try {
            block()
        } finally {
            unlock()
        }
    }
}
