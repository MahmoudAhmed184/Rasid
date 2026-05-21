import type { AiRequestContext } from '../../entities/ai/model'

export interface GenerateProposalRequest {
    readonly templateId: string
    readonly context: AiRequestContext
}

export type GenerateProposalResponse =
    | {
          success: false
          error: string
      }
    | {
          success: true
          mode: 'direct'
          proposal: string
          provider: string
          model: string
      }
    | {
          success: true
          mode: 'bridge'
          prompt: string
          chatUrl: string
      }
