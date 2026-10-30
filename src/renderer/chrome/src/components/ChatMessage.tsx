import React, { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { Berry } from './Berry'

export const Markdown: React.FC<{ content: string }> = ({ content }) => (
    <div className="prose max-w-none prose-pre:p-3 prose-pre:overflow-x-auto">
        <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkBreaks]}
            components={{
                code: ({ node, className, children, ...props }) => {
                    const inline = !className
                    return inline ? (
                        <code className="bg-muted px-1 py-0.5 rounded-control" {...props}>
                            {children}
                        </code>
                    ) : (
                        <code className={className} {...props}>
                            {children}
                        </code>
                    )
                },
                a: ({ children, href }) => (
                    <a
                        href={href}
                        className="text-accent-ink hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {children}
                    </a>
                ),
            }}
        >
            {content}
        </ReactMarkdown>
    </div>
)

const StreamingText: React.FC<{ content: string }> = ({ content }) => {
    const [displayedContent, setDisplayedContent] = useState('')
    const [currentIndex, setCurrentIndex] = useState(0)

    useEffect(() => {
        if (currentIndex < content.length) {
            const timer = setTimeout(() => {
                setDisplayedContent(content.slice(0, currentIndex + 1))
                setCurrentIndex(currentIndex + 1)
            }, 10)
            return () => clearTimeout(timer)
        }
        return undefined
    }, [content, currentIndex])

    return (
        <div className="whitespace-pre-wrap text-16 text-foreground">
            {displayedContent}
            {currentIndex < content.length && (
                <span className="inline-block w-2 h-5 bg-accent-ink ml-0.5 animate-pulse" />
            )}
        </div>
    )
}

export const UserMessage: React.FC<{ content: string }> = ({ content }) => (
    <div className="max-w-[85%] ml-auto px-4 py-2.5 rounded-panel bg-muted text-16 text-foreground whitespace-pre-wrap animate-fade-in">
        {content}
    </div>
)

// The main chat has room for Berry beside its replies. In the narrow panel, the reply takes the width.
export const AssistantMessage: React.FC<{ content: string; isStreaming?: boolean; avatar?: boolean }> = ({
    content,
    isStreaming,
    avatar = false
}) => (
    <div className="relative animate-fade-in">
        {avatar && (
            <Berry mood={isStreaming ? 'thinking' : 'rest'} size={28} className="absolute -left-11 top-0" />
        )}
        {isStreaming ? <StreamingText content={content} /> : <Markdown content={content} />}
    </div>
)

// Berry's working state while a reply is on its way.
export const ThinkingMessage: React.FC = () => (
    <div role="status" className="flex items-center gap-2.5 text-14 text-muted-foreground animate-fade-in">
        <Berry mood="thinking" size={22} />
        Thinking
    </div>
)
