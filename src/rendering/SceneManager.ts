import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export class SceneManager {
  /** Clamp ceiling for per-frame dt (seconds) to absorb tab-switch / breakpoint gaps. */
  private static readonly MAX_FRAME_DT_SECONDS = 0.1
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private renderer: THREE.WebGLRenderer
  private controls: OrbitControls
  private ambientLight: THREE.AmbientLight
  private directionalLight: THREE.DirectionalLight
  private animationFrameId: number | null = null
  private onAnimateCallbacks: Array<(dt: number) => void> = []
  private lastTimeMs: number | null = null

  constructor() {
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x0f1117)

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    this.camera.position.set(15, 15, 15)
    this.camera.lookAt(0, 0, 0)

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.1
    this.controls.minDistance = 5
    this.controls.maxDistance = 50
    this.controls.minPolarAngle = 0.2
    this.controls.maxPolarAngle = 1.2
    this.controls.target.set(0, 0, 0)

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    this.scene.add(this.ambientLight)

    this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    this.directionalLight.position.set(10, 20, 10)
    this.directionalLight.castShadow = true
    this.directionalLight.shadow.mapSize.set(2048, 2048)
    this.directionalLight.shadow.camera.near = 0.5
    this.directionalLight.shadow.camera.far = 60
    this.directionalLight.shadow.camera.left = -15
    this.directionalLight.shadow.camera.right = 15
    this.directionalLight.shadow.camera.top = 15
    this.directionalLight.shadow.camera.bottom = -15
    this.scene.add(this.directionalLight)
  }

  mount(container: HTMLElement): void {
    const { clientWidth, clientHeight } = container
    this.renderer.setSize(clientWidth, clientHeight)
    this.camera.aspect = clientWidth / clientHeight
    this.camera.updateProjectionMatrix()
    container.appendChild(this.renderer.domElement)
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  onAnimate(callback: (dt: number) => void): void {
    this.onAnimateCallbacks.push(callback)
  }

  animate(): void {
    const loop = () => {
      this.animationFrameId = requestAnimationFrame(loop)
      const now = performance.now()
      let dt: number
      if (this.lastTimeMs === null) {
        dt = 0
      } else {
        dt = Math.min((now - this.lastTimeMs) / 1000, SceneManager.MAX_FRAME_DT_SECONDS)
      }
      this.lastTimeMs = now
      this.controls.update()
      for (const cb of this.onAnimateCallbacks) {
        cb(dt)
      }
      this.renderer.render(this.scene, this.camera)
    }
    loop()
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.camera
  }

  getScene(): THREE.Scene {
    return this.scene
  }

  getRenderer(): THREE.WebGLRenderer {
    return this.renderer
  }

  getControls(): OrbitControls {
    return this.controls
  }

  dispose(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
    this.onAnimateCallbacks.length = 0
    this.controls.dispose()
    this.scene.remove(this.ambientLight)
    this.scene.remove(this.directionalLight)
    this.ambientLight.dispose()
    this.directionalLight.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
