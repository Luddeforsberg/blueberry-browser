// Until the user takes over, the live view takes neither the pointer nor the keyboard, so nothing they do reaches the
// page while a job works in it. `inert` is what keeps Tab out: no pointer events alone still lets the frame be focused.
export const liveFrameLock = (takenOver: boolean): { inert?: boolean; tabIndex?: number; className?: string } =>
    takenOver ? {} : { inert: true, tabIndex: -1, className: 'pointer-events-none' }
