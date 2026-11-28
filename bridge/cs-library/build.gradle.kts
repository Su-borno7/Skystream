// Compiles CloudStream's own `library` module (the extension API) for plain JVM,
// straight from the pinned upstream checkout (see fetch-upstream.sh), so extensions
// link against the exact classes and signatures they were built for on Android.
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    kotlin("multiplatform")
    kotlin("plugin.serialization")
}

val upstream = rootProject.file("upstream/cloudstream/library/src")
val niceHttp = rootProject.file("upstream/nicehttp/library/src/main/java")

kotlin {
    jvm {
        // Extensions are compiled for JVM 1.8 and inline library functions.
        compilerOptions { jvmTarget.set(JvmTarget.JVM_11) }
    }

    compilerOptions {
        freeCompilerArgs.addAll("-Xexpect-actual-classes", "-Xannotation-default-target=param-property", "-nowarn")
    }

    sourceSets {
        all {
            languageSettings {
                optIn("com.lagradost.cloudstream3.InternalAPI")
                optIn("com.lagradost.cloudstream3.Prerelease")
            }
        }
        commonMain {
            kotlin.srcDir(upstream.resolve("commonMain/kotlin"))
            // Cinelab-specific replacements for generated sources (BuildConfig).
            kotlin.srcDir("src/shim/kotlin")
            // Compiled in the same module: same circular setup upstream (implicitly) relies on.
            kotlin.srcDir(niceHttp)
            dependencies {
                api("androidx.annotation:annotation:1.10.0")
                api("com.fasterxml.jackson.module:jackson-module-kotlin:2.13.1")
                api("org.jsoup:jsoup:1.22.1")
                api("org.jetbrains.kotlinx:atomicfu:0.33.0")
                api("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.11.0")
                api("org.jetbrains.kotlinx:kotlinx-datetime:0.8.0")
                api("org.jetbrains.kotlinx:kotlinx-io-core:0.9.1")
                api("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
                api("com.fleeksoft.ksoup:ksoup:0.2.6")
                api("io.ktor:ktor-http:3.5.0")
                api("org.mozilla:rhino:1.8.1")
                api("dev.whyoleg.cryptography:cryptography-core:0.6.0")
                api("dev.whyoleg.cryptography:cryptography-provider-optimal:0.6.0")
                // NiceHttp (compiled from source above) runs on OkHttp.
                api("com.squareup.okhttp3:okhttp:5.3.2")
                api("com.squareup.okhttp3:okhttp-dnsoverhttps:5.3.2")
                api("org.json:json:20260522")
            }
        }
        jvmMain {
            kotlin.srcDir(upstream.resolve("jvmMain/kotlin"))
            kotlin.srcDir("src/jvmShim/kotlin")
            kotlin.srcDir(upstream.resolve("jvmCommonMain/kotlin"))
            dependencies {
                api("org.jetbrains.kotlin:kotlin-reflect:2.4.0")
                // NewPipe extractor used by the JVM/Android YouTube provider (resolved via jitpack, same as upstream).
                api("com.github.teamnewpipe:NewPipeExtractor:v0.26.3")
            }
        }
    }
}
