import { useEffect, useState } from 'react'

const NORMALIZED_WIDTH = 512
const NORMALIZED_HEIGHT = 720
const CONTENT_TOP = 30
const CONTENT_HEIGHT = 660
const ALPHA_THRESHOLD = 8

type CachedImage = {
  image: HTMLImageElement
  normalized: HTMLCanvasElement | null
  promise: Promise<HTMLCanvasElement>
}

const cache = new Map<string, CachedImage>()

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function normalizeImage(image: HTMLImageElement) {
  const sourceCanvas = createCanvas(image.naturalWidth, image.naturalHeight)
  const sourceContext = sourceCanvas.getContext('2d', {
    willReadFrequently: true,
  })

  if (!sourceContext) {
    throw new Error('Canvas 2D context is unavailable')
  }

  sourceContext.drawImage(image, 0, 0)

  const pixels = sourceContext.getImageData(
    0,
    0,
    sourceCanvas.width,
    sourceCanvas.height,
  ).data

  let minX = sourceCanvas.width
  let minY = sourceCanvas.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < sourceCanvas.height; y += 1) {
    for (let x = 0; x < sourceCanvas.width; x += 1) {
      const alpha = pixels[(y * sourceCanvas.width + x) * 4 + 3]

      if (alpha < ALPHA_THRESHOLD) {
        continue
      }

      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error('Image has no visible pixels')
  }

  const sourceWidth = maxX - minX + 1
  const sourceHeight = maxY - minY + 1
  const uniformScale = CONTENT_HEIGHT / sourceHeight
  const targetWidth = sourceWidth * uniformScale
  const targetX = (NORMALIZED_WIDTH - targetWidth) / 2

  const normalizedCanvas = createCanvas(NORMALIZED_WIDTH, NORMALIZED_HEIGHT)
  const normalizedContext = normalizedCanvas.getContext('2d')

  if (!normalizedContext) {
    throw new Error('Canvas 2D context is unavailable')
  }

  normalizedContext.imageSmoothingEnabled = true
  normalizedContext.imageSmoothingQuality = 'high'
  normalizedContext.drawImage(
    image,
    minX,
    minY,
    sourceWidth,
    sourceHeight,
    targetX,
    CONTENT_TOP,
    targetWidth,
    CONTENT_HEIGHT,
  )

  return normalizedCanvas
}

function loadImage(source: string): CachedImage {
  const cached = cache.get(source)

  if (cached) {
    return cached
  }

  const image = new window.Image()
  image.decoding = 'async'

  let entry: CachedImage
  const promise = new Promise<HTMLCanvasElement>((resolve, reject) => {
    image.onload = () => {
      try {
        const normalized = normalizeImage(image)
        entry.normalized = normalized
        resolve(normalized)
      } catch (error) {
        reject(error)
      }
    }
    image.onerror = () => reject(new Error(`Image failed to load: ${source}`))
  })

  entry = {
    image,
    normalized: null,
    promise,
  }
  cache.set(source, entry)
  image.src = source

  return entry
}

function getLoadedImage(sources: readonly string[]) {
  for (const source of sources) {
    const normalized = cache.get(source)?.normalized

    if (normalized) {
      return normalized
    }
  }

  return null
}

export function useCachedImage(sources: readonly string[]) {
  const sourceKey = sources.join('\u0000')
  const [image, setImage] = useState<HTMLCanvasElement | null>(() => {
    return getLoadedImage(sources)
  })

  useEffect(() => {
    let active = true

    async function resolveImage() {
      for (const source of sources) {
        try {
          const normalizedImage = await loadImage(source).promise

          if (active) {
            setImage(normalizedImage)
          }
          return
        } catch {
          // Try the next source. State PNGs fall back to the generated SVG image.
        }
      }

      if (active) {
        setImage(null)
      }
    }

    void resolveImage()

    return () => {
      active = false
    }
  }, [sourceKey, sources])

  return image
}
