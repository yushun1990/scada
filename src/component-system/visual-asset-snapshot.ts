/** Presentation-session data only; never a persisted resource or component value. */
export type VisualAssetSnapshot<T> = Readonly<{ source: string; image: T | null }>

export function readVisualAssetSnapshot<T>(
  source: string,
  snapshot: VisualAssetSnapshot<T>,
): T | null {
  return snapshot.source === source ? snapshot.image : null
}
