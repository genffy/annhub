/**
 * The container a recording is written in (annotate.md §2.2): MP4 with H.264 and
 * AAC where the browser's recorder can write it, WebM with VP9 or VP8 and Opus
 * where it cannot.
 */

export type RecordingContainer = 'mp4' | 'webm'

/**
 * Tried in this order; the first one the recorder supports is asked for. MP4
 * comes first because H.264 + AAC is the pair that system players, phones and
 * chat tools open. The three WebM types are the fallback for a browser that is
 * too old, or has no H.264 or AAC encoder: VP9 first, then VP8, then the bare
 * container, which leaves the codecs to the browser.
 */
export const RECORDING_TYPES = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'] as const

/** The recorder type to ask for, or '' when the recorder supports none of them and the browser picks its own default (WebM). */
export function pickRecordingType(isSupported: (type: string) => boolean): string {
  return RECORDING_TYPES.find(isSupported) ?? ''
}

/** The container a recorder type names; anything but MP4 is WebM, which is what the browser writes when it is not told. */
export function containerOf(type: string): RecordingContainer {
  return /^video\/mp4\b/i.test(type.trim()) ? 'mp4' : 'webm'
}

/** The blob type of a finished video: the container alone, without the codecs the recorder reports. */
export function blobTypeOf(container: RecordingContainer): string {
  return `video/${container}`
}

/** `AnnHub/recording-<local time>.<container>`: the same local-time 口径 as the screenshot filename (storage.md §6). */
export function recordingFilename(now: Date, container: RecordingContainer): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
  return `AnnHub/recording-${stamp}.${container}`
}
