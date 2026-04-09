/**
 * Procedural audio manager using Web Audio API.
 * Generates all sounds programmatically — no audio files needed.
 */
export class AudioManager {
  private static instance: AudioManager | null = null

  private context: AudioContext | null = null
  private masterGain: GainNode | null = null
  private _muted = false
  private _volume = 1.0
  private beltOscillator: OscillatorNode | null = null
  private beltGain: GainNode | null = null
  private resumeHandler: (() => void) | null = null

  private constructor() {
    // Private — use getInstance()
  }

  static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager()
    }
    return AudioManager.instance
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context

    try {
      this.context = new AudioContext()
      this.masterGain = this.context.createGain()
      this.masterGain.gain.value = this._muted ? 0 : this._volume
      this.masterGain.connect(this.context.destination)
      this.setupAutoplayResume()
    } catch {
      return null
    }

    return this.context
  }

  private setupAutoplayResume(): void {
    if (this.resumeHandler) return

    this.resumeHandler = () => {
      if (this.context?.state === 'suspended') {
        void this.context.resume()
      }
    }

    document.addEventListener('click', this.resumeHandler, { once: false })
    document.addEventListener('keydown', this.resumeHandler, { once: false })
  }

  /** Short mechanical clank/whir for machine processing. */
  playMachineProcess(): void {
    const ctx = this.ensureContext()
    if (!ctx || !this.masterGain) return

    const now = ctx.currentTime

    // Low-frequency square wave burst = metallic clank
    const osc = ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.setValueAtTime(120, now)
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.08)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.3, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1)

    osc.connect(gain)
    gain.connect(this.masterGain)
    osc.start(now)
    osc.stop(now + 0.1)

    // Higher-pitched whir overtone
    const osc2 = ctx.createOscillator()
    osc2.type = 'sawtooth'
    osc2.frequency.setValueAtTime(400, now)
    osc2.frequency.exponentialRampToValueAtTime(200, now + 0.08)

    const gain2 = ctx.createGain()
    gain2.gain.setValueAtTime(0.1, now)
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.08)

    osc2.connect(gain2)
    gain2.connect(this.masterGain)
    osc2.start(now)
    osc2.stop(now + 0.1)
  }

  /** Toggle continuous low hum for belt rolling. */
  playBeltRolling(): void {
    if (this.beltOscillator) return

    const ctx = this.ensureContext()
    if (!ctx || !this.masterGain) return

    this.beltOscillator = ctx.createOscillator()
    this.beltOscillator.type = 'sine'
    this.beltOscillator.frequency.value = 70

    this.beltGain = ctx.createGain()
    this.beltGain.gain.value = 0.08

    this.beltOscillator.connect(this.beltGain)
    this.beltGain.connect(this.masterGain)
    this.beltOscillator.start()
  }

  /** Stop belt rolling hum. */
  stopBeltRolling(): void {
    if (this.beltOscillator) {
      this.beltOscillator.stop()
      this.beltOscillator.disconnect()
      this.beltOscillator = null
    }
    if (this.beltGain) {
      this.beltGain.disconnect()
      this.beltGain = null
    }
  }

  /** Ascending jingle for level completion. */
  playSuccess(): void {
    const ctx = this.ensureContext()
    if (!ctx || !this.masterGain) return

    const now = ctx.currentTime
    // C5, E5, G5, C6
    const notes = [523.25, 659.25, 783.99, 1046.5]
    const noteDuration = 0.12
    const master = this.masterGain

    for (let i = 0; i < notes.length; i++) {
      const start = now + i * noteDuration
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = notes[i]

      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.2, start)
      gain.gain.exponentialRampToValueAtTime(0.001, start + noteDuration * 1.5)

      osc.connect(gain)
      gain.connect(master)
      osc.start(start)
      osc.stop(start + noteDuration * 1.5)
    }
  }

  /** Short click for UI interactions. */
  playUIClick(): void {
    const ctx = this.ensureContext()
    if (!ctx || !this.masterGain) return

    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.value = 1200

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.15, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03)

    osc.connect(gain)
    gain.connect(this.masterGain)
    osc.start(now)
    osc.stop(now + 0.03)
  }

  /** Short buzzer for errors. */
  playError(): void {
    const ctx = this.ensureContext()
    if (!ctx || !this.masterGain) return

    const now = ctx.currentTime

    // Dissonant two-tone buzz
    const osc1 = ctx.createOscillator()
    osc1.type = 'sawtooth'
    osc1.frequency.value = 150

    const osc2 = ctx.createOscillator()
    osc2.type = 'sawtooth'
    osc2.frequency.value = 160 // slight detuning for dissonance

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.25, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2)

    osc1.connect(gain)
    osc2.connect(gain)
    gain.connect(this.masterGain)
    osc1.start(now)
    osc2.start(now)
    osc1.stop(now + 0.2)
    osc2.stop(now + 0.2)
  }

  setMasterVolume(volume: number): void {
    this._volume = Math.max(0, Math.min(1, volume))
    if (this.masterGain && !this._muted) {
      this.masterGain.gain.value = this._volume
    }
  }

  mute(): void {
    this._muted = true
    if (this.masterGain) {
      this.masterGain.gain.value = 0
    }
  }

  unmute(): void {
    this._muted = false
    if (this.masterGain) {
      this.masterGain.gain.value = this._volume
    }
  }

  isMuted(): boolean {
    return this._muted
  }

  dispose(): void {
    this.stopBeltRolling()

    if (this.resumeHandler) {
      document.removeEventListener('click', this.resumeHandler)
      document.removeEventListener('keydown', this.resumeHandler)
      this.resumeHandler = null
    }

    if (this.context) {
      void this.context.close()
      this.context = null
    }

    this.masterGain = null
    AudioManager.instance = null
  }
}
