import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DictationQualityRun } from './dictation-quality-contract'

describe('dictation quality contract', () => {
  it('hashes the exact PCM bytes and keeps semantic quality UNKNOWN', () => {
    const samples = new Float32Array([0.25, -0.25])
    const expectedHash = createHash('sha256')
      .update(new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength))
      .digest('hex')
    const run = new DictationQualityRun({
      modelId: 'model-a',
      provider: 'local',
      modelArtifactVersion: 'artifact-sha256'
    })

    run.addAudio(samples, 16_000)
    const provenance = run.snapshot()

    expect(provenance.audio_sha256).toBe(expectedHash)
    expect(provenance.audio_sha256_unavailable_reason).toBeNull()
    expect(provenance.model_version).toBe('artifact-sha256')
    expect(provenance.source_role).toBe('candidate')
    expect(provenance.diarizer).toBe('not_applicable')
    expect(provenance.diarizer_version).toBe('not_applicable')
    expect(provenance.aligner).toBe('not_applicable')
    expect(provenance.quality_status).toBe('UNKNOWN')
    expect(provenance.delivery_status).toBe('draft_unverified')
  })

  it('keeps the repository manifest wired into the normal test suite', () => {
    const root = resolve(__dirname, '../../..')
    const manifest = JSON.parse(
      readFileSync(resolve(root, 'transcription-quality.json'), 'utf8')
    ) as Record<string, unknown>
    const requiredProvenance = [
      'audio_sha256',
      'engine_id',
      'asr_backend',
      'model_name',
      'model_version',
      'diarizer',
      'profile',
      'fallback_reason',
      'quality_status',
      'delivery_status'
    ]

    expect(manifest.profiles).toEqual(['dictation'])
    expect(manifest.external_teacher_runtime_dependency).toBe(false)
    expect(manifest.quality_status_values).toEqual(
      expect.arrayContaining(['PASS', 'FAIL', 'UNKNOWN'])
    )
    expect(manifest.source_roles).toEqual(
      expect.arrayContaining(['teacher_raw', 'human_gold', 'candidate', 'production'])
    )
    expect(manifest.provenance_fields).toEqual(expect.arrayContaining(requiredProvenance))
    expect(manifest.delivery_policy).toEqual({
      unknown: 'draft_unverified',
      final_verified_requires: ['quality_status=PASS', 'source_role=production']
    })
    expect(manifest.entrypoints).toContain('src/main/speech/stt-service.ts')
    expect(manifest.regression_tests).toEqual(
      expect.arrayContaining([
        'src/main/speech/stt-service.test.ts',
        'src/main/speech/dictation-quality-contract.test.ts'
      ])
    )
    for (const pathKey of [
      'contract_module',
      'evaluation_policy',
      'rights_registry',
      'smoke_evidence'
    ]) {
      expect(readFileSync(resolve(root, manifest[pathKey] as string))).toBeTruthy()
    }
  })
})
