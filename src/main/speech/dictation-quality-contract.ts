import { createHash, randomUUID, type Hash } from 'node:crypto'

export type TranscriptionQualityProvenance = {
  contract_version: '1.0'
  run_id: string
  created_at: string
  audio_sha256: string | null
  audio_sha256_unavailable_reason: string | null
  audio_duration_ms: number
  profile: 'dictation'
  source_role: 'candidate'
  engine_id: string
  asr_backend: string
  model_name: string
  model_version: string
  diarizer: 'not_applicable'
  diarizer_version: 'not_applicable'
  aligner: 'not_applicable'
  lexicon_version: null
  prompt_version: null
  postprocessor: null
  postprocessor_version: null
  fallback_reason: string | null
  quality_status: 'UNKNOWN'
  delivery_status: 'draft_unverified'
  evaluation_id: null
}

export type WorkerTranscriptionBoundary =
  | { type: 'partial'; text?: string; provenance_owner: 'stt-service' }
  | { type: 'final'; text?: string; provenance_owner: 'stt-service' }

type DictationQualityRunOptions = {
  modelId: string
  provider: 'local' | 'openai'
  modelArtifactVersion?: string
}

export class DictationQualityRun {
  private readonly audioHash: Hash = createHash('sha256')
  private readonly createdAt = new Date().toISOString()
  private readonly runId = randomUUID()
  private readonly options: DictationQualityRunOptions
  private audioByteCount = 0
  private audioDurationMs = 0

  constructor(options: DictationQualityRunOptions) {
    this.options = options
  }

  addAudio(samples: Float32Array, sampleRate: number): void {
    this.audioHash.update(new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength))
    this.audioByteCount += samples.byteLength
    this.audioDurationMs += (samples.length / sampleRate) * 1000
  }

  snapshot(): TranscriptionQualityProvenance {
    const isOpenAi = this.options.provider === 'openai'
    const modelName = isOpenAi ? this.options.modelId.replace(/^openai-/, '') : this.options.modelId

    return {
      contract_version: '1.0',
      run_id: this.runId,
      created_at: this.createdAt,
      audio_sha256: this.audioByteCount > 0 ? this.audioHash.copy().digest('hex') : null,
      audio_sha256_unavailable_reason: this.audioByteCount > 0 ? null : 'no_audio_bytes_received',
      audio_duration_ms: Math.round(this.audioDurationMs),
      profile: 'dictation',
      source_role: 'candidate',
      engine_id: isOpenAi ? 'openai-transcription' : 'sherpa-onnx',
      asr_backend: isOpenAi ? 'openai' : 'sherpa-onnx',
      model_name: modelName,
      model_version: this.options.modelArtifactVersion ?? modelName,
      diarizer: 'not_applicable',
      diarizer_version: 'not_applicable',
      aligner: 'not_applicable',
      lexicon_version: null,
      prompt_version: null,
      postprocessor: null,
      postprocessor_version: null,
      fallback_reason: null,
      quality_status: 'UNKNOWN',
      delivery_status: 'draft_unverified',
      evaluation_id: null
    }
  }
}
