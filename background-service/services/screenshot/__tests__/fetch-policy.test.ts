import { describe, expect, it } from 'vitest'
import { ResourceRefused, assertFetchableUrl, isPrivateHost, readImage, sniffImageType } from '../fetch-policy'

describe('assertFetchableUrl', () => {
  it('lets a public web address through', () => {
    expect(assertFetchableUrl('https://cdn.example.com/a/b.png?x=1').href).toBe('https://cdn.example.com/a/b.png?x=1')
    expect(assertFetchableUrl('http://93.184.216.34/logo.png').hostname).toBe('93.184.216.34')
    expect(assertFetchableUrl('http://[2606:2800:220:1:248:1893:25c8:1946]/logo.png').protocol).toBe('http:')
  })

  it.each([
    ['a relative address', '/images/a.png'],
    ['nothing', ''],
    ['file:', 'file:///etc/passwd'],
    ['ftp:', 'ftp://example.com/a.png'],
    ['chrome-extension:', 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/icon.png'],
    ['javascript:', 'javascript:alert(1)'],
    ['an address with credentials', 'https://user:pass@example.com/a.png'],
    ['localhost', 'http://localhost:3000/a.png'],
    ['a name under .localhost', 'http://app.localhost/a.png'],
    ['a loopback address', 'http://127.0.0.1:8765/health'],
    ['the loopback range', 'http://127.1.2.3/'],
    ['a decimal spelling of loopback', 'http://2130706433/'],
    ['a hex spelling of loopback', 'http://0x7f.1/'],
    ['an octal spelling of loopback', 'http://0177.0.0.1/'],
    ['the cloud metadata address', 'http://169.254.169.254/latest/meta-data/'],
    ['a 10/8 address', 'http://10.0.0.5/camera.jpg'],
    ['a 192.168/16 address', 'http://192.168.1.1/logo.png'],
    ['a 172.16/12 address', 'http://172.20.0.2/logo.png'],
    ['IPv6 loopback', 'http://[::1]/a.png'],
    ['an IPv4-mapped loopback', 'http://[::ffff:127.0.0.1]/a.png'],
    ['an intranet name', 'http://intranet/logo.png'],
    ['a .local name', 'http://printer.local/status.png'],
  ])('refuses %s', (_label, raw) => {
    expect(() => assertFetchableUrl(raw)).toThrow(ResourceRefused)
  })
})

describe('isPrivateHost', () => {
  it.each(['localhost', 'LOCALHOST', 'localhost.', 'a.localhost', 'nas.local', 'host.internal', 'router.lan', 'x.home.arpa', 'wiki.corp', 'printer', ''])('%j is private', host => {
    expect(isPrivateHost(host)).toBe(true)
  })

  it.each(['example.com', 'cdn.example.co.uk', 'localhost.example.com', 'notlocal.com', 'xlocalhost.com', 'a.b.c.d.e.example.org'])('%j is public', host => {
    expect(isPrivateHost(host)).toBe(false)
  })

  it.each([
    '0.0.0.0',
    '0.1.2.3',
    '10.255.255.255',
    '100.64.0.1',
    '100.127.255.254',
    '127.0.0.1',
    '169.254.0.1',
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.8',
    '192.168.0.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
  ])('IPv4 %s is private', address => {
    expect(isPrivateHost(address)).toBe(true)
  })

  it.each([
    '1.1.1.1',
    '8.8.8.8',
    '93.184.216.34',
    '100.63.255.255',
    '100.128.0.1',
    '172.15.0.1',
    '172.32.0.1',
    '192.0.2.1',
    '192.169.0.1',
    '198.17.0.1',
    '198.20.0.1',
    '223.255.255.255',
  ])('IPv4 %s is public', address => {
    expect(isPrivateHost(address)).toBe(false)
  })

  it.each([
    '[::]',
    '[::1]',
    '[fc00::1]',
    '[fd12:3456:789a::1]',
    '[fe80::1]',
    '[febf::1]',
    '[ff02::1]',
    '[::ffff:127.0.0.1]',
    '[::ffff:7f00:1]',
    '[::ffff:10.0.0.1]',
    '[::ffff:a9fe:a9fe]',
    '[64:ff9b::7f00:1]',
    '[2002:7f00:1::1]',
    '[0:0:0:0:0:0:0:1]',
  ])('IPv6 %s is private', address => {
    expect(isPrivateHost(address)).toBe(true)
  })

  it.each(['[2606:2800:220:1:248:1893:25c8:1946]', '[2001:4860:4860::8888]', '[::ffff:8.8.8.8]', '[::ffff:808:808]', '[2a00::1]', '[2002:808:808::1]'])(
    'IPv6 %s is public',
    address => {
      expect(isPrivateHost(address)).toBe(false)
    },
  )

  it('refuses an IPv6 literal it cannot read rather than fetching from it', () => {
    expect(isPrivateHost('[1:2:3:4:5:6:7:8:9]')).toBe(true)
    expect(isPrivateHost('[1::2::3]')).toBe(true)
    expect(isPrivateHost('[zzzz::1]')).toBe(true)
    expect(isPrivateHost('[1:2:3:4:5:6:7::8]')).toBe(true)
  })
})

describe('sniffImageType', () => {
  const head = (...bytes: number[]) => new Uint8Array([...bytes, ...new Array(16).fill(0)])

  it('knows the formats a page loads in an <img>', () => {
    expect(sniffImageType(head(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png')
    expect(sniffImageType(head(0xff, 0xd8, 0xff))).toBe('image/jpeg')
    expect(sniffImageType(head(0x47, 0x49, 0x46, 0x38))).toBe('image/gif')
    expect(sniffImageType(head(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe('image/webp')
    expect(sniffImageType(head(0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66))).toBe('image/avif')
    expect(sniffImageType(head(0x00, 0x00, 0x01, 0x00))).toBe('image/x-icon')
    expect(sniffImageType(head(0x42, 0x4d))).toBe('image/bmp')
  })

  it.each([
    ['JSON', '{"secret":true}'],
    ['HTML', '<!doctype html><html></html>'],
    ['a RIFF file that is not WebP', 'RIFF\0\0\0\0WAVEfmt '],
    ['nothing', ''],
  ])('does not take %s for an image', (_name, text) => {
    expect(sniffImageType(new TextEncoder().encode(text))).toBeUndefined()
  })
})

describe('readImage', () => {
  const answer = (body: BodyInit | null, headers: Record<string, string>) => new Response(body, { headers })

  it('returns the body of an image, keeping its type', async () => {
    const blob = await readImage(answer(new Uint8Array([1, 2, 3]), { 'content-type': 'image/png' }))
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBe(3)
  })

  it('accepts a type with parameters and any case', async () => {
    expect((await readImage(answer(new Uint8Array([1]), { 'content-type': 'Image/SVG+xml; charset=utf-8' }))).type).toBe('image/svg+xml')
  })

  it.each(['text/html', 'application/json', 'text/plain; charset=utf-8', 'application/pdf', 'video/mp4'])('refuses a %j response', async type => {
    await expect(readImage(answer('{"secret":true}', { 'content-type': type }))).rejects.toThrow(ResourceRefused)
  })

  it.each(['', 'application/octet-stream', 'binary/octet-stream'])('refuses a %j response whose bytes are not an image', async type => {
    await expect(readImage(answer('{"secret":true}', type ? { 'content-type': type } : {}))).rejects.toThrow(ResourceRefused)
  })

  it.each([
    ['png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0], 'image/png'],
    ['jpeg', [0xff, 0xd8, 0xff, 0xe0, 0, 0x10], 'image/jpeg'],
    ['gif', [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 'image/gif'],
  ])('takes a %s from a bucket that names no type, and says what it is', async (_name, bytes, expected) => {
    for (const type of ['', 'application/octet-stream', 'binary/octet-stream']) {
      const blob = await readImage(answer(new Uint8Array(bytes), type ? { 'content-type': type } : {}))
      expect(blob.type).toBe(expected)
      expect(blob.size).toBe(bytes.length)
    }
  })

  it('trusts a declared image type without looking at the bytes, as the page itself would', async () => {
    expect((await readImage(answer(new Uint8Array([1, 2, 3, 4]), { 'content-type': 'image/png' }))).type).toBe('image/png')
  })

  it('refuses an image whose declared length is over the limit before reading it', async () => {
    const response = answer(new Uint8Array(10), { 'content-type': 'image/png', 'content-length': '5000' })
    await expect(readImage(response, 100)).rejects.toThrow('too large')
  })

  it('stops reading an image that outgrows the limit though it declared nothing', async () => {
    let pulls = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        controller.enqueue(new Uint8Array(40))
        if (pulls > 50) controller.close()
      },
    })
    const response = new Response(stream, { headers: { 'content-type': 'image/png' } })
    await expect(readImage(response, 100)).rejects.toThrow('too large')
    expect(pulls).toBeLessThan(10)
  })

  it('accepts an image exactly at the limit', async () => {
    const blob = await readImage(answer(new Uint8Array(100), { 'content-type': 'image/webp' }), 100)
    expect(blob.size).toBe(100)
  })
})
