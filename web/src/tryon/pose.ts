import type { PoseLandmarker } from '@mediapipe/tasks-vision'

export type Delegate = 'GPU' | 'CPU'

export interface LoadedPose {
  landmarker: PoseLandmarker
  delegate: Delegate
}

/** Paths are resolved against the document so they work with Vite `base: './'`. */
export function mediapipeUrls() {
  return {
    wasm: new URL('mediapipe', document.baseURI).href,
    model: new URL('models/pose_landmarker_lite.task', document.baseURI).href,
  }
}

/**
 * Create a PoseLandmarker, trying the GPU delegate first and falling back to CPU.
 * The MediaPipe bundle is imported lazily so it never weighs on the main chunk.
 */
export async function loadPoseLandmarker(mode: 'VIDEO' | 'IMAGE', preferGpu = true): Promise<LoadedPose> {
  const vision = await import('@mediapipe/tasks-vision')
  const { wasm, model } = mediapipeUrls()
  const fileset = await vision.FilesetResolver.forVisionTasks(wasm)
  const order: Delegate[] = preferGpu ? ['GPU', 'CPU'] : ['CPU']
  let lastErr: unknown
  for (const delegate of order) {
    try {
      const landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: model, delegate },
        runningMode: mode,
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputSegmentationMasks: false,
      })
      return { landmarker, delegate }
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Pose model failed to load')
}
