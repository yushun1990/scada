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
    image.onerror = () => reject(new Error('Pump image failed to load'))
  })

  image.src = source

  const entry = { image, promise }
  cache.set(source, entry)
  return entry
}

export function useCachedImage(source: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(() => {
    const cached = cache.get(source)?.image
    return cached?.complete ? cached : null
  })

  useEffect(() => {
    let active = true
    const entry = loadImage(source)

    if (entry.image.complete && entry.image.naturalWidth > 0) {
      setImage(entry.image)
      return () => {
        active = false
      }
    }

    entry.promise
      .then((loadedImage) => {
        if (active) {
          setImage(loadedImage)
        }
      })
      .catch(() => {
        if (active) {
          setImage(null)
        }
      })

    return () => {
      active = false
    }
  }, [source])

  return image
}
