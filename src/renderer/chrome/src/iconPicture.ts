// The app's icon as a PNG data address, `size` pixels square, from an AppIcon (components/AppIcon.tsx) on the page. Its
// colours are tokens, which only the page can resolve, so each is written in as the page computed it before the drawing
// goes to a canvas. As the systems' own icons are, the square is inset by about a tenth and stands on a soft shadow.
export async function iconPicture(svg: SVGSVGElement, size: number): Promise<string> {
    const copy = svg.cloneNode(true) as SVGSVGElement
    const originals = [svg, ...svg.querySelectorAll('*')]
    const copies = [copy, ...copy.querySelectorAll('*')]
    originals.forEach((element, at) => {
        const computed = getComputedStyle(element)
        for (const property of ['fill', 'stroke', 'stop-color']) {
            if (element.getAttribute(property)?.includes('var(')) copies[at].setAttribute(property, computed.getPropertyValue(property))
        }
    })
    const inset = Math.round((size * 100) / 1024)
    copy.setAttribute('width', String(size - inset * 2))
    copy.setAttribute('height', String(size - inset * 2))
    const image = new Image()
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`
    await image.decode()

    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    if (!context) throw new Error('No canvas to draw the icon on')
    // A shadow on the desktop under the icon, not a colour in the chrome.
    context.shadowColor = 'rgb(0 0 0 / 0.28)'
    context.shadowBlur = size * 0.03
    context.shadowOffsetY = size * 0.012
    context.drawImage(image, inset, inset, size - inset * 2, size - inset * 2)
    return canvas.toDataURL('image/png')
}
