import { useEffect, useState } from 'react'
import type { ThemeState } from '@shared/ipc'

// The desktop's windows follow the theme as the window does, though the drop itself is near-black in both.
export const useDesktopTheme = (): ThemeState | null => {
    const [theme, setTheme] = useState<ThemeState | null>(null)
    useEffect(() => {
        const apply = (next: ThemeState) => {
            document.documentElement.classList.toggle('dark', next.isDark)
            setTheme(next)
        }
        void window.chromeAPI.theme.getTheme().then(apply)
        return window.chromeAPI.theme.onThemeUpdated(apply)
    }, [])
    return theme
}
