// Android API compatibility layer for running CloudStream extensions in a
// headless JVM process. Everything here is a minimal stand-in for the Android
// framework classes that extensions touch at runtime.
plugins {
    kotlin("jvm")
}

kotlin {
    jvmToolchain(21)
}

dependencies {
    api(project(":cs-library"))
    api("androidx.annotation:annotation:1.10.0")
    api("com.fasterxml.jackson.core:jackson-databind:2.13.1")
    api("com.fasterxml.jackson.module:jackson-module-kotlin:2.13.1")
}
