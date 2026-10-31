import { describe, expect, it } from 'vitest'
import type { DownloadInfo } from '@shared/ipc'
import { downloadStatus, formatBytes, fractionDone } from './downloadStatus'

const download = (patch: Partial<DownloadInfo>): DownloadInfo => ({
    id: '1',
    filename: 'report.pdf',
    path: '/tmp/report.pdf',
    source: null,
    state: 'completed',
    receivedBytes: 2048,
    totalBytes: 4096,
    startedAt: 0,
    canResume: false,
    missing: false,
    ...patch
})

describe('formatBytes', () => {
    it('steps up a unit exactly at 1024 and stops at the largest', () => {
        expect(formatBytes(0)).toBe('0 B')
        expect(formatBytes(1023)).toBe('1023 B')
        expect(formatBytes(1024)).toBe('1.0 KB')
        expect(formatBytes(150 * 1024)).toBe('150 KB')
        expect(formatBytes(5000 * 1024 ** 4)).toBe('5000 TB')
    })
})

describe('fractionDone', () => {
    it('has no answer without a size, and never passes the end', () => {
        expect(fractionDone(10, 0)).toBeNull()
        expect(fractionDone(0, 10)).toBe(0)
        expect(fractionDone(10, 10)).toBe(1)
        expect(fractionDone(11, 10)).toBe(1)
    })
})

describe('downloadStatus', () => {
    it('says so when a finished file is missing, whatever else is true', () => {
        expect(downloadStatus(download({ missing: true })).text).toBe('File is missing')
    })

    it('tells an unknown size apart from a known one', () => {
        expect(downloadStatus(download({ state: 'progressing' })).text).toBe('2.0 KB of 4.0 KB')
        expect(downloadStatus(download({ state: 'progressing', totalBytes: 0 })).text).toBe('2.0 KB so far')
    })

    it('tells a stop that can carry on apart from one that can not', () => {
        expect(downloadStatus(download({ state: 'interrupted', canResume: true })).text).toContain('Stopped')
        expect(downloadStatus(download({ state: 'interrupted' })).text).toBe('Didn’t finish')
    })
})
