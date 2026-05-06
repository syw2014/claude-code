// src/runtime/engine/CostMonitor.ts
import type { CostState, TokenCounts } from '../types.js'

export interface CostMonitorConfig {
  budgetInputTokens?: number
  budgetOutputTokens?: number
}

export class CostMonitor {
  private state: CostState

  constructor(config: CostMonitorConfig = {}) {
    this.state = {
      inputTokensTotal: 0,
      outputTokensTotal: 0,
      budgetInputTokens: config.budgetInputTokens,
      budgetOutputTokens: config.budgetOutputTokens,
      budgetExceeded: false,
    }
  }

  addUsage(counts: TokenCounts): void {
    this.state.inputTokensTotal += counts.inputTokens
    this.state.outputTokensTotal += counts.outputTokens
    this.checkBudget()
  }

  private checkBudget(): void {
    const inputExceeded = this.state.budgetInputTokens !== undefined &&
      this.state.inputTokensTotal > this.state.budgetInputTokens
    const outputExceeded = this.state.budgetOutputTokens !== undefined &&
      this.state.outputTokensTotal > this.state.budgetOutputTokens
    this.state.budgetExceeded = inputExceeded || outputExceeded
  }

  getState(): Readonly<CostState> {
    return { ...this.state }
  }

  isBudgetExceeded(): boolean {
    return this.state.budgetExceeded
  }
}
