// Rows coming and going in a list the user is working in (DESIGN.md section 7). A row that's gone stays a moment where
// it was, folding to nothing, so the rows under it slide up rather than jump. This is the bookkeeping, with no DOM.

export interface Row<T> {
    key: string
    item: T
}

export interface GoneRow<T> extends Row<T> {
    // The row drawn just before it when it went, so it folds in its own place.
    after: string | null
    at: number
}

export interface DrawnRow<T> extends Row<T> {
    phase: 'here' | 'opening' | 'folding'
}

// What went between two lists of rows. `drawn` is what was on screen, rows folding away included, so a row that goes
// while the one before it is still folding keeps its place after that one.
export const goneSince = <T>(drawn: Row<T>[], now: Set<string>, at: number): GoneRow<T>[] =>
    drawn.flatMap((row, index) => (now.has(row.key) ? [] : [{ ...row, after: index > 0 ? drawn[index - 1].key : null, at }]))

// Rows that are done folding go for good, and any that went after one of them now follow what that one followed.
export const forgetGone = <T>(gone: GoneRow<T>[], done: (row: GoneRow<T>) => boolean): GoneRow<T>[] =>
    gone.filter(done).reduce((left, row) => left.filter((each) => each !== row).map((each) => (each.after === row.key ? { ...each, after: row.after } : each)), gone)

// Every row to draw: those here, in order, with each gone one put back just after the row it followed.
export const rowsToDraw = <T>(here: Row<T>[], gone: GoneRow<T>[], opening: Set<string>): DrawnRow<T>[] => {
    const drawn: DrawnRow<T>[] = here.map((row) => ({ ...row, phase: opening.has(row.key) ? 'opening' : 'here' }))
    let left = gone.filter((row) => !drawn.some(({ key }) => key === row.key))
    while (left.length > 0) {
        const placed = left.find((row) => row.after === null || drawn.some(({ key }) => key === row.after)) ?? left[0]
        const at = placed.after === null ? 0 : drawn.findIndex(({ key }) => key === placed.after) + 1
        drawn.splice(Math.max(at, 0), 0, { key: placed.key, item: placed.item, phase: 'folding' })
        left = left.filter((row) => row !== placed)
    }
    return drawn
}
