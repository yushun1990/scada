import { useEffect, useState } from 'react'

type CachedImage = {
  image: HTMLImageElement
  promise: Promise<HTMLImageElement>
}

const cache = new Map<string, CachedImage>()

function loadImage(source: string): CachedImage {
  const cached = cache.get(source)

  if (cached) {
    return cached
  }

  const image = new window.Image()
  image.decoding = 'async'

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Image failed to load: ${source}`))
  })

  image.src = source

  const entry = { image, promise }
  cache.set(source, entry)
  return entry
}

function getLoadedImage(sources: readonly string[]) {
  for (const source of sources) {
    const image = cache.get(source)?.image

    if (image?.complete && image.naturalWidth > 0) {
      return image
    }
  }

  return null
}

export function useCachedImage(sources: readonly string[]) {
  const sourceKey = sources.join('\u0000')
  const [image, setImage] = useState<HTMLImageElement | null>(() => {
    return getLoadedImage(sources)
  })

  useEffect(() => {
    let active = true

    async function resolveImage() {
      for (const source of sources) {
        try {
          const loadedImage = await loadImage(source).promise

          if (active) {
            setImage(loadedImage)
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
