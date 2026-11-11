import type { ValleyLight } from '@shared/ipc'
import { paintValley, type ValleyBox } from './painter'

export interface PaintRequest {
    id: number
    width: number
    height: number
    box: ValleyBox
    light: ValleyLight
}

// Paints off the main thread, so typing never waits for the valley. Sends back a bitmap at one pixel per 2px cell.
self.onmessage = (event: MessageEvent<PaintRequest>) => {
    const { id, width, height, box, light } = event.data
    const painted = paintValley(width, height, box, light)
    const canvas = new OffscreenCanvas(painted.width, painted.height)
    canvas.getContext('2d')!.putImageData(new ImageData(painted.data, painted.width, painted.height), 0, 0)
    const bitmap = canvas.transferToImageBitmap()
    ;(self as unknown as Worker).postMessage({ id, bitmap, banks: painted.banks }, [bitmap])
}
