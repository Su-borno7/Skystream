package com.lagradost.cloudstream3.ui.settings

import com.fasterxml.jackson.annotation.JsonProperty
import com.lagradost.cloudstream3.app
import com.lagradost.cloudstream4.viewmodels.GithubFile
import com.lagradost.cloudstream4.viewmodels.GithubRepository
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.io.FileNotFoundException

object GithubReleases : GithubRepository {
    @Serializable
    private data class GithubAsset(
        @JsonProperty("name") @SerialName("name") val name: String,
        @JsonProperty("size") @SerialName("size") val size: Int, // Size in bytes
        @JsonProperty("browser_download_url") @SerialName("browser_download_url") val browserDownloadUrl: String,
        @JsonProperty("content_type") @SerialName("content_type") val contentType: String, // application/vnd.android.package-archive
        @JsonProperty("digest") @SerialName("digest") val digest: String? = null, // sha256:..., may be null
    )

    @Serializable
    private data class GithubRelease(
        @JsonProperty("tag_name") @SerialName("tag_name") val tagName: String, // Version code
        @JsonProperty("body") @SerialName("body") val body: String? = null, // Description, may be null
        @JsonProperty("assets") @SerialName("assets") val assets: List<GithubAsset>,
        @JsonProperty("target_commitish") @SerialName("target_commitish") val targetCommitish: String, // Branch
        @JsonProperty("prerelease") @SerialName("prerelease") val prerelease: Boolean,
        @JsonProperty("node_id") @SerialName("node_id") val nodeId: String,
        @JsonProperty("created_at") @SerialName("created_at") val createdAt: String, // YYYY-MM-DDTHH:MM:SSZ
    )

    @Serializable
    private data class GithubObject(
        @JsonProperty("sha") @SerialName("sha") val sha: String, // SHA-256 hash
        //@JsonProperty("type") @SerialName("type") val type: String,
        ///@JsonProperty("url") @SerialName("url") val url: String,
    )

    @Serializable
    private data class GithubTag(
        //@JsonProperty("node_id") @SerialName("node_id") val nodeId: String,
        @JsonProperty("object") @SerialName("object") val githubObject: GithubObject,
    )

    const val APK_USERNAME = "Su-borno7"
    const val APK_REPOSITORY = "Skystream"
    const val APK_PRERELEASE = "pre-release"
    const val APK_CONTENT_TYPE = "application/vnd.android.package-archive"

    private val defaultHeaders = mapOf("Accept" to "application/vnd.github.v3+json")

    private val versionRegex = Regex("""(\d+)\.(\d+)\.(\d+)""")

    @Throws
    override suspend fun getSha(
        userName: String,
        repository: String,
        tag: String,
    ): String {
        return app.get(
            url = "https://api.github.com/repos/$userName/$repository/git/ref/tags/$tag",
            headers = defaultHeaders
        ).parsed<GithubTag>().githubObject.sha
    }

    @Throws
    override suspend fun getRelease(
        userName: String,
        repository: String,
        prerelease: Boolean,
        prereleaseTag: String,
        contentType: String,
    ): GithubFile {
        val latestRelease: GithubRelease = if (prerelease) {
            // Find the release object
            // https://docs.github.com/en/rest/releases/releases?apiVersion=2026-03-10#get-a-release-by-tag-name
            val url = "https://api.github.com/repos/$userName/$repository/releases/tags/$prereleaseTag"
            app.get(url = url, headers = defaultHeaders).parsed<GithubRelease>()
        } else {
            // Do not use /releases/latest here: it returns the most recent non-prerelease
            // release repo-wide, which may be a desktop-only release with no APK attached.
            // Instead pick the newest non-prerelease release that actually carries an
            // asset of the requested content type, by semver.
            val url = "https://api.github.com/repos/$userName/$repository/releases?per_page=30"
            val releases = app.get(url = url, headers = defaultHeaders).parsed<Array<GithubRelease>>()
            releases
                .filter { release -> !release.prerelease }
                .mapNotNull { release ->
                    val asset = release.assets.firstOrNull { asset -> asset.contentType == contentType }
                        ?: return@mapNotNull null
                    val version = versionRegex.find(asset.name)?.groupValues?.let {
                        Triple(it[1].toInt(), it[2].toInt(), it[3].toInt())
                    }
                    Pair(release to asset, version ?: Triple(0, 0, 0))
                }
                .maxWithOrNull(compareBy({ it.second.first }, { it.second.second }, { it.second.third }))
                ?.first
                ?.first
                ?: throw FileNotFoundException()
        }

        // Find the first correct asset, given that we might have other binaries we release in the same version
        val foundAsset = latestRelease.assets.firstOrNull { asset ->
            asset.contentType == contentType
        }

        if (foundAsset == null) {
            throw FileNotFoundException()
        }

        return GithubFile(
            digest = foundAsset.digest,
            downloadUrl = foundAsset.browserDownloadUrl,
            displayName = foundAsset.name.substringBeforeLast("."),
            changeLog = latestRelease.body.orEmpty(),
            tagName = latestRelease.tagName,
            nodeId = latestRelease.nodeId
        )
    }
}