// Skystream Bridge: loads .cs3 extensions on the JVM and exposes a small
// loopback HTTP API to the desktop app.
plugins {
    kotlin("jvm")
    application
}

kotlin {
    jvmToolchain(21)
}

dependencies {
    implementation(project(":cs-library"))
    implementation(project(":android-shim"))
    implementation("de.femtopedia.dex2jar:dex-translator:2.4.38")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin:2.13.1")
    // Plugin classes are verified with the shim on the classloader; disabling
    // bytecode verification matches what the Android runtime tolerates for
    // dex2jar output (missing reference types).
    testImplementation(kotlin("test"))
}

application {
    applicationName = "skystream-bridge"
    mainClass.set("com.skystream.bridge.BridgeKt")
    applicationDefaultJvmArgs = listOf(
        "-XX:+UnlockDiagnosticVMOptions",
        "-XX:-BytecodeVerificationRemote",
        "-Dstdout.encoding=UTF-8",
        "-Dstderr.encoding=UTF-8",
    )
}

tasks.test {
    useJUnitPlatform()
}
