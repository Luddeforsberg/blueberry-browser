import type { ValleyLight } from '@shared/ipc'
import { paintValley, type ValleyBox } from './painter'

export interface PaintRequest {
    id: number
    width: number
    height: number
    box: ValleyBox
    light: ValleyLight
    // Device pixels per CSS pixel, so it's painted at the screen's own resolution.
    dpr: number
}

// Paints off the main thread, so typing never waits for the valley. Sends back a bitmap at the screen's resolution.
self.onmessage = (event: MessageEvent<PaintRequest>) => {
    const { id, width, height, box, light, dpr } = event.data
    const painted = paintValley(width, height, box, light, dpr)
    const canvas = new OffscreenCanvas(painted.width, painted.height)
    canvas.getContext('2d')!.putImageData(new ImageData(painted.data, painted.width, painted.height), 0, 0)
    const bitmap = canvas.transferToImageBitmap()
    self.postMessage({ id, bitmap, banks: painted.banks }, { transfer: [bitmap] })
}
