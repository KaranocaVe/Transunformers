import type { GraphColorMode } from '../explorer/store'
import type { GraphNodeData } from './types'

type Tone = {
  frame: string
  header: string
  badge: string
  text: string
}

const roleTones: Record<string, Tone> = {
  input: {
    frame: 'border-cyan-300/70 bg-cyan-500/5',
    header: 'border-cyan-200/50 bg-cyan-500/10',
    badge: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
    text: 'text-cyan-700 dark:text-cyan-300',
  },
  encoder: {
    frame: 'border-indigo-300/70 bg-indigo-500/5',
    header: 'border-indigo-200/50 bg-indigo-500/10',
    badge: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
    text: 'text-indigo-700 dark:text-indigo-300',
  },
  decoder: {
    frame: 'border-violet-300/70 bg-violet-500/5',
    header: 'border-violet-200/50 bg-violet-500/10',
    badge: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
    text: 'text-violet-700 dark:text-violet-300',
  },
  block: {
    frame: 'border-emerald-300/70 bg-emerald-500/5',
    header: 'border-emerald-200/50 bg-emerald-500/10',
    badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  norm: {
    frame: 'border-amber-300/70 bg-amber-500/5',
    header: 'border-amber-200/50 bg-amber-500/10',
    badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    text: 'text-amber-700 dark:text-amber-300',
  },
  head: {
    frame: 'border-rose-300/70 bg-rose-500/5',
    header: 'border-rose-200/50 bg-rose-500/10',
    badge: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
    text: 'text-rose-700 dark:text-rose-300',
  },
  aux: {
    frame: 'border-slate-300/70 bg-slate-500/5',
    header: 'border-slate-200/50 bg-slate-500/10',
    badge: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
    text: 'text-slate-700 dark:text-slate-300',
  },
}

const parameterScaleTones: Record<NonNullable<GraphNodeData['parameterScale']>, Tone> = {
  tiny: {
    frame: 'border-slate-300/70 bg-slate-500/5',
    header: 'border-slate-200/50 bg-slate-500/8',
    badge: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
    text: 'text-slate-700 dark:text-slate-300',
  },
  small: {
    frame: 'border-cyan-300/70 bg-cyan-500/5',
    header: 'border-cyan-200/50 bg-cyan-500/10',
    badge: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
    text: 'text-cyan-700 dark:text-cyan-300',
  },
  medium: {
    frame: 'border-emerald-300/70 bg-emerald-500/5',
    header: 'border-emerald-200/50 bg-emerald-500/10',
    badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  large: {
    frame: 'border-amber-300/70 bg-amber-500/5',
    header: 'border-amber-200/50 bg-amber-500/10',
    badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    text: 'text-amber-700 dark:text-amber-300',
  },
  huge: {
    frame: 'border-rose-300/70 bg-rose-500/5',
    header: 'border-rose-200/50 bg-rose-500/10',
    badge: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
    text: 'text-rose-700 dark:text-rose-300',
  },
}

const trainableTones = (ratio: number | null | undefined): Tone => {
  if (ratio === null || ratio === undefined) {
    return parameterScaleTones.tiny
  }
  if (ratio >= 0.9) return parameterScaleTones.huge
  if (ratio >= 0.6) return parameterScaleTones.large
  if (ratio >= 0.3) return parameterScaleTones.medium
  if (ratio > 0) return parameterScaleTones.small
  return parameterScaleTones.tiny
}

export const getNodeTone = (data: GraphNodeData, mode: GraphColorMode): Tone => {
  if (mode === 'parameters') {
    return data.parameterScale ? parameterScaleTones[data.parameterScale] : roleTones.aux
  }

  if (mode === 'trainable') {
    return data.trainableRatio === null || data.trainableRatio === undefined
      ? roleTones.aux
      : trainableTones(data.trainableRatio)
  }

  return roleTones[data.role ?? 'aux'] ?? roleTones.aux
}

export const roleLabelMap: Record<string, string> = {
  input: 'graphSemantics.role.input',
  encoder: 'graphSemantics.role.encoder',
  decoder: 'graphSemantics.role.decoder',
  block: 'graphSemantics.role.block',
  norm: 'graphSemantics.role.norm',
  head: 'graphSemantics.role.head',
  aux: 'graphSemantics.role.aux',
}

export const branchLabelMap: Record<NonNullable<GraphNodeData['branchHint']>, string> = {
  sequential: 'graphSemantics.branch.sequential',
  parallel: 'graphSemantics.branch.parallel',
  bridge: 'graphSemantics.branch.bridge',
}

export const quantityLabelMap: Record<GraphColorMode, string> = {
  role: 'graphSemantics.quantity.role',
  parameters: 'graphSemantics.quantity.parameters',
  trainable: 'graphSemantics.quantity.trainable',
}
