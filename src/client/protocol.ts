export type { CpaAccount, CpaAccountModelsView, CpaAccountSelection, CpaAccountsView, CpaConfigView, CpaInputModality, CpaModelCapabilitiesView, CpaModelCapability, CpaModelInputCapabilitiesView, CpaModelInputCapability, CpaQuota, CpaQuotaWindow, CpaRefreshIntervalView, CpaRpcValue, CpaSpeed } from '../protocol.ts'

export interface CpaSettings {
  endpoint: string
  providerId: string
  managementKeyEnv: string
  timeoutMs?: number
}
