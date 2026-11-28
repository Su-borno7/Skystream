// Cinelab Bridge — JVM host for CloudStream (.cs3) extensions on desktop.
pluginManagement {
    repositories {
        gradlePluginPortal()
        google()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        // Google's mirror of Maven Central first: repo1.maven.org sometimes refuses
        // GitHub-hosted build machines. Same artifacts, different host.
        maven("https://maven-central.storage-download.googleapis.com/maven2/")
        mavenCentral()
        google()
        maven("https://jitpack.io")
    }
}

rootProject.name = "cinelab-bridge"
include(":cs-library", ":android-shim", ":app")
