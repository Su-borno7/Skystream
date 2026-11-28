package com.cinelab.bridge

import com.lagradost.cloudstream3.AnimeLoadResponse
import com.lagradost.cloudstream3.Episode
import com.lagradost.cloudstream3.EpisodeResponse
import com.lagradost.cloudstream3.LiveStreamLoadResponse
import com.lagradost.cloudstream3.LoadResponse
import com.lagradost.cloudstream3.MainAPI
import com.lagradost.cloudstream3.MovieLoadResponse
import com.lagradost.cloudstream3.SearchResponse
import com.lagradost.cloudstream3.SubtitleFile
import com.lagradost.cloudstream3.TorrentLoadResponse
import com.lagradost.cloudstream3.TvSeriesLoadResponse
import com.lagradost.cloudstream3.utils.ExtractorLink
import com.lagradost.cloudstream3.AudioFile

/** JSON-safe serialisation of the library objects the UI needs. */
object Serialize {

    fun searchResponse(r: SearchResponse): Map<String, Any?> = mapOf(
        "name" to r.name,
        "url" to r.url,
        "apiName" to r.apiName,
        "type" to runCatching { r.type?.name }.getOrNull(),
        "posterUrl" to r.posterUrl,
        "posterHeaders" to r.posterHeaders,
        "id" to r.id,
        "quality" to runCatching { r.quality?.name }.getOrNull(),
        "score" to scoreDouble(r.score),
    )

    fun episode(e: Episode): Map<String, Any?> = mapOf(
        "data" to e.data,
        "name" to e.name,
        "season" to e.season,
        "episode" to e.episode,
        "posterUrl" to e.posterUrl,
        "description" to e.description,
        "date" to e.date,
        "runTime" to e.runTime,
        "score" to scoreDouble(e.score),
    )

    private fun scoreDouble(score: com.lagradost.cloudstream3.Score?): Double? =
        runCatching { score?.toDouble(10) }.getOrNull()

    fun loadResponse(r: LoadResponse): Map<String, Any?> {
        val base = linkedMapOf<String, Any?>(
            "name" to r.name,
            "url" to r.url,
            "apiName" to r.apiName,
            "type" to runCatching { r.type.name }.getOrNull(),
            "posterUrl" to r.posterUrl,
            "posterHeaders" to r.posterHeaders,
            "backgroundPosterUrl" to r.backgroundPosterUrl,
            "logoUrl" to r.logoUrl,
            "contentRating" to r.contentRating,
            "year" to r.year,
            "plot" to r.plot,
            "tags" to r.tags,
            "duration" to r.duration,
            "score" to scoreDouble(r.score),
            "comingSoon" to r.comingSoon,
            "uniqueUrl" to r.uniqueUrl,
            "trailers" to r.trailers.map { mapOf("extractorUrl" to it.extractorUrl, "referer" to it.referer, "raw" to it.raw, "headers" to it.headers) },
            "actors" to r.actors?.map { a ->
                mapOf(
                    "name" to a.actor.name,
                    "image" to a.actor.image,
                    "role" to runCatching { a.role?.name }.getOrNull(),
                    "roleString" to a.roleString,
                    "voiceActor" to a.voiceActor?.let { mapOf("name" to it.name, "image" to it.image) },
                )
            },
            "recommendations" to r.recommendations?.map(::searchResponse),
        )

        when (r) {
            is AnimeLoadResponse -> {
                base["kind"] = "anime"
                base["engName"] = r.engName
                base["japName"] = r.japName
                base["synonyms"] = r.synonyms
                base["episodes"] = r.episodes.mapKeys { it.key.name }
                    .mapValues { (_, eps) -> eps.map(::episode) }
                addSeasonNames(base, r)
                addShowStatus(base, r)
            }
            is TvSeriesLoadResponse -> {
                base["kind"] = "tvseries"
                base["episodes"] = mapOf("None" to r.episodes.map(::episode))
                addSeasonNames(base, r)
                addShowStatus(base, r)
            }
            is MovieLoadResponse -> {
                base["kind"] = "movie"
                base["dataUrl"] = r.dataUrl
            }
            is LiveStreamLoadResponse -> {
                base["kind"] = "live"
                base["dataUrl"] = r.dataUrl
            }
            is TorrentLoadResponse -> {
                base["kind"] = "torrent"
                base["dataUrl"] = r.magnet ?: r.torrent
                base["magnet"] = r.magnet
                base["torrent"] = r.torrent
            }
            else -> base["kind"] = r.javaClass.simpleName
        }
        return base
    }

    private fun addSeasonNames(base: MutableMap<String, Any?>, r: EpisodeResponse) {
        base["seasonNames"] = r.seasonNames?.map { mapOf("season" to it.season, "name" to it.name, "displaySeason" to it.displaySeason) }
    }

    private fun addShowStatus(base: MutableMap<String, Any?>, r: EpisodeResponse) {
        base["showStatus"] = runCatching { r.showStatus?.name }.getOrNull()
        base["nextAiring"] = r.nextAiring?.let { mapOf("episode" to it.episode, "unixTime" to it.unixTime, "season" to it.season) }
    }

    fun extractorLink(l: ExtractorLink): Map<String, Any?> = mapOf(
        "source" to l.source,
        "name" to l.name,
        "url" to l.url,
        "referer" to l.referer,
        "quality" to l.quality,
        "headers" to l.headers,
        "extractorData" to l.extractorData,
        "type" to runCatching { l.type.name }.getOrNull(),
        "isM3u8" to l.isM3u8,
        "isDash" to l.isDash,
        "audioTracks" to l.audioTracks.map(::audioFile),
    )

    fun audioFile(a: AudioFile): Map<String, Any?> = mapOf(
        "url" to a.url,
        "headers" to a.headers,
    )

    fun subtitleFile(s: SubtitleFile): Map<String, Any?> = mapOf(
        "lang" to s.lang,
        "url" to s.url,
        "headers" to s.headers,
    )

    fun provider(internalName: String, p: MainAPI): Map<String, Any?> = mapOf(
        "internalName" to internalName,
        "name" to p.name,
        "mainUrl" to p.mainUrl,
        "lang" to p.lang,
        "supportedTypes" to runCatching { p.supportedTypes.map { it.name } }.getOrNull(),
        "hasMainPage" to p.hasMainPage,
        "usesWebView" to p.usesWebView,
        "providerType" to runCatching { p.providerType.name }.getOrNull(),
        "vpnStatus" to runCatching { p.vpnStatus.name }.getOrNull(),
        "instantLinkLoading" to p.instantLinkLoading,
        "hasDownloadSupport" to p.hasDownloadSupport,
    )
}
