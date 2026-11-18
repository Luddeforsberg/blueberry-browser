// While a menu main opened from the floating sidebar is up, the sidebar stays out: the pointer going to the menu, which is
// a view of its own, isn't the pointer leaving the sidebar.
let held = 0

export const isHeld = () => held > 0

export const holdWhile = async <T>(work: Promise<T>): Promise<T> => {
    held++
    try {
        return await work
    } finally {
        held--
    }
}
