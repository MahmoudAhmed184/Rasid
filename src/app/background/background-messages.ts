import { browser } from 'wxt/browser'

import type { JobBatchResult } from '../../features/monitoring/job-batch-publisher'
import type {
    GenerateProposalRequest,
    GenerateProposalResponse,
} from '../../features/proposals/proposal-contract'
import type {
    ZipDownloadResult,
    ZipEntryInput,
} from '../../features/downloads/zip-downloads'

export interface BackgroundMessageRequestMap {
    checkNow: {
        readonly action: 'checkNow'
    }
    testNotification: {
        readonly action: 'testNotification'
    }
    testSound: {
        readonly action: 'testSound'
    }
    updateAlarm: {
        readonly action: 'updateAlarm'
        readonly interval?: number
    }
    reconnectSignalR: {
        readonly action: 'reconnectSignalR'
    }
    disconnectSignalR: {
        readonly action: 'disconnectSignalR'
    }
    debugFetch: {
        readonly action: 'debugFetch'
    }
    generateProposal: {
        readonly action: 'generateProposal'
        readonly templateId: GenerateProposalRequest['templateId']
        readonly context: GenerateProposalRequest['context']
    }
    downloadZip: {
        readonly action: 'downloadZip'
        readonly filename: string
        readonly files: readonly ZipEntryInput[]
    }
}

export interface BackgroundMessageResponseMap {
    checkNow: JobBatchResult
    testNotification: { readonly success: true }
    testSound: { readonly success: true }
    updateAlarm: { readonly success: true }
    reconnectSignalR: { readonly success: true }
    disconnectSignalR: { readonly success: true }
    debugFetch: { readonly success: boolean; readonly length?: number; readonly error?: string }
    generateProposal: GenerateProposalResponse
    downloadZip: ZipDownloadResult
}

export type BackgroundMessageAction = keyof BackgroundMessageRequestMap

export type BackgroundRuntimeMessage =
    BackgroundMessageRequestMap[BackgroundMessageAction]

export type BackgroundMessageHandlerMap = {
    readonly [Action in BackgroundMessageAction]: (
        message: BackgroundMessageRequestMap[Action]
    ) =>
        | Promise<BackgroundMessageResponseMap[Action]>
        | BackgroundMessageResponseMap[Action]
}

export type BackgroundTransportResponse<Action extends BackgroundMessageAction = BackgroundMessageAction> =
    | {
          readonly ok: true
          readonly action: Action
          readonly data: BackgroundMessageResponseMap[Action]
      }
    | {
          readonly ok: false
          readonly action: Action
          readonly error: string
      }

const BACKGROUND_ACTIONS: ReadonlySet<BackgroundMessageAction> = new Set([
    'checkNow',
    'testNotification',
    'testSound',
    'updateAlarm',
    'reconnectSignalR',
    'disconnectSignalR',
    'debugFetch',
    'generateProposal',
    'downloadZip',
])

export function isBackgroundRuntimeMessage(value: unknown): value is BackgroundRuntimeMessage {
    if (!value || typeof value !== 'object') {
        return false
    }

    const candidate = value as Record<string, unknown>
    return (
        typeof candidate.action === 'string' &&
        BACKGROUND_ACTIONS.has(candidate.action as BackgroundMessageAction)
    )
}

export function isBackgroundTransportResponseForAction(
    value: unknown,
    action: BackgroundMessageAction
): value is BackgroundTransportResponse {
    if (!value || typeof value !== 'object') {
        return false
    }

    const candidate = value as Record<string, unknown>

    if (candidate.action !== action || typeof candidate.ok !== 'boolean') {
        return false
    }

    if (candidate.ok) {
        return 'data' in candidate
    }

    return typeof candidate.error === 'string'
}

export function createBackgroundTransportSuccess<Action extends BackgroundMessageAction>(
    action: Action,
    data: BackgroundMessageResponseMap[Action]
): BackgroundTransportResponse<Action> {
    return {
        ok: true,
        action,
        data,
    }
}

export function createBackgroundTransportFailure<Action extends BackgroundMessageAction>(
    action: Action,
    error: string
): BackgroundTransportResponse<Action> {
    return {
        ok: false,
        action,
        error,
    }
}

export function dispatchBackgroundMessage(
    handlers: BackgroundMessageHandlerMap,
    message: BackgroundRuntimeMessage
):
    | Promise<BackgroundMessageResponseMap[BackgroundMessageAction]>
    | BackgroundMessageResponseMap[BackgroundMessageAction] {
    switch (message.action) {
        case 'checkNow':
            return handlers.checkNow(message)
        case 'testNotification':
            return handlers.testNotification(message)
        case 'testSound':
            return handlers.testSound(message)
        case 'updateAlarm':
            return handlers.updateAlarm(message)
        case 'reconnectSignalR':
            return handlers.reconnectSignalR(message)
        case 'disconnectSignalR':
            return handlers.disconnectSignalR(message)
        case 'debugFetch':
            return handlers.debugFetch(message)
        case 'generateProposal':
            return handlers.generateProposal(message)
        case 'downloadZip':
            return handlers.downloadZip(message)
    }
}

export async function sendBackgroundMessage<Action extends BackgroundMessageAction>(
    message: BackgroundMessageRequestMap[Action]
): Promise<BackgroundMessageResponseMap[Action]> {
    const response = await browser.runtime.sendMessage(message)

    if (!isBackgroundTransportResponseForAction(response, message.action)) {
        throw new Error(`Invalid background response for ${message.action}.`)
    }

    const transportResponse = response as BackgroundTransportResponse<Action>

    if (!transportResponse.ok) {
        throw new Error(transportResponse.error)
    }

    return transportResponse.data
}

export function requestCheckNow(): Promise<BackgroundMessageResponseMap['checkNow']> {
    return sendBackgroundMessage<'checkNow'>({ action: 'checkNow' })
}

export function requestTestNotification(): Promise<BackgroundMessageResponseMap['testNotification']> {
    return sendBackgroundMessage<'testNotification'>({ action: 'testNotification' })
}

export function requestTestSound(): Promise<BackgroundMessageResponseMap['testSound']> {
    return sendBackgroundMessage<'testSound'>({ action: 'testSound' })
}

export function requestUpdateAlarm(
    interval?: number
): Promise<BackgroundMessageResponseMap['updateAlarm']> {
    return sendBackgroundMessage<'updateAlarm'>({ action: 'updateAlarm', interval })
}

export function requestReconnectSignalR(): Promise<BackgroundMessageResponseMap['reconnectSignalR']> {
    return sendBackgroundMessage<'reconnectSignalR'>({ action: 'reconnectSignalR' })
}

export function requestDisconnectSignalR(): Promise<BackgroundMessageResponseMap['disconnectSignalR']> {
    return sendBackgroundMessage<'disconnectSignalR'>({ action: 'disconnectSignalR' })
}

export function requestDebugFetch(): Promise<BackgroundMessageResponseMap['debugFetch']> {
    return sendBackgroundMessage<'debugFetch'>({ action: 'debugFetch' })
}

export function requestGenerateProposal(
    request: GenerateProposalRequest
): Promise<BackgroundMessageResponseMap['generateProposal']> {
    return sendBackgroundMessage<'generateProposal'>({
        action: 'generateProposal',
        templateId: request.templateId,
        context: request.context,
    })
}

export function requestDownloadZip(
    filename: string,
    files: readonly ZipEntryInput[]
): Promise<BackgroundMessageResponseMap['downloadZip']> {
    return sendBackgroundMessage<'downloadZip'>({
        action: 'downloadZip',
        filename,
        files,
    })
}
