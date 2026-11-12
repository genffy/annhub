import { describe, expect, it } from 'vitest'
import { blobTypeOf, containerOf, pickRecordingType, RECORDING_TYPES, recordingFilename } from '../recording-format'

/**
 * annotate.md §2.2: the recording is an MP4 (H.264 + AAC) wherever the browser's
 * recorder can write one, and a WebM (VP9, else VP8, with Opus) where it cannot.
 */

const mp4 = 'video/mp4;codecs=avc1,mp4a.40.2'
const vp9 = 'video/webm;codecs=vp9,opus'
const vp8 = 'video/webm;codecs=vp8,opus'

describe('which type the recorder is asked for', () => {
  it('is MP4 with H.264 and AAC when the recorder supports everything', () => {
    expect(pickRecordingType(() => true)).toBe(mp4)
  })

  it('is MP4 when that is all the recorder supports', () => {
    expect(pickRecordingType(type => type === mp4)).toBe(mp4)
  })

  it('falls back to WebM with VP9 when the recorder cannot write MP4', () => {
    expect(pickRecordingType(type => type.startsWith('video/webm'))).toBe(vp9)
  })

  it('falls back to VP8 when VP9 is missing too', () => {
    expect(pickRecordingType(type => type !== mp4 && type !== vp9)).toBe(vp8)
  })

  it('falls back to the bare WebM container when no codec pair is supported', () => {
    expect(pickRecordingType(type => type === 'video/webm')).toBe('video/webm')
  })

  it('asks for nothing when the recorder supports none of them: the browser picks its own default', () => {
    expect(pickRecordingType(() => false)).toBe('')
  })

  it('tries MP4 first and only WebM after it', () => {
    expect(RECORDING_TYPES[0]).toBe(mp4)
    expect(RECORDING_TYPES.slice(1).every(type => type.startsWith('video/webm'))).toBe(true)
  })
})

describe('which container a recorder type names', () => {
  it('is mp4 for the MP4 type, with or without codecs, in any case', () => {
    expect(containerOf(mp4)).toBe('mp4')
    expect(containerOf('video/mp4')).toBe('mp4')
    expect(containerOf(' VIDEO/MP4;codecs=avc1 ')).toBe('mp4')
  })

  it('is webm for the WebM types, and for a recorder that reports no type at all', () => {
    expect(containerOf(vp9)).toBe('webm')
    expect(containerOf(vp8)).toBe('webm')
    expect(containerOf('video/webm')).toBe('webm')
    expect(containerOf('')).toBe('webm')
  })
})

describe('the finished video', () => {
  it('has the container alone as its blob type, without the codecs the recorder reports', () => {
    expect(blobTypeOf('mp4')).toBe('video/mp4')
    expect(blobTypeOf('webm')).toBe('video/webm')
  })

  it('is named AnnHub/recording-<local time>.<container>', () => {
    const when = new Date(2026, 10, 12, 23, 3, 54)
    expect(recordingFilename(when, 'mp4')).toBe('AnnHub/recording-2026-11-12T23-03-54.mp4')
    expect(recordingFilename(when, 'webm')).toBe('AnnHub/recording-2026-11-12T23-03-54.webm')
  })

  it('pads single digits, so the names sort by time', () => {
    expect(recordingFilename(new Date(2026, 0, 2, 3, 4, 5), 'mp4')).toBe('AnnHub/recording-2026-01-02T03-04-05.mp4')
  })
})
