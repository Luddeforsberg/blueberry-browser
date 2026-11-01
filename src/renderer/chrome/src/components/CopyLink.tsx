import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@common/components/Button'

const SAID_FOR_MS = 1500

export const CopyLink: React.FC<{ link: string; label?: string }> = ({ link, label }) => {
    const [copied, setCopied] = useState(false)
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    useEffect(() => () => clearTimeout(timer.current), [])
    const copy = async () => {
        await navigator.clipboard.writeText(link)
        setCopied(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), SAID_FOR_MS)
    }
    return <Button variant="outline" size="sm" aria-label={label} onClick={() => void copy()}>{copied ? 'Copied' : 'Copy link'}</Button>
}
