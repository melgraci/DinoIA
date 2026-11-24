export type Action = 0 | 1; // 0 = CORRER, 1 = SALTAR

export type DistanceBucket = 0 | 1 | 2 | 3 | 4;
export type ObstacleKind = 0 | 1; // 0 = Cacto Pequeno, 1 = Cacto Grande
export type SpeedTier = 0 | 1; // 0 = Normal (< 410 px/s), 1 = Rápida (>= 410 px/s)

export const ACTION_LABELS: Record<Action, string> = {
  0: 'CORRER',
  1: 'SALTAR',
};

export const DISTANCE_LABELS: Record<DistanceBucket, { name: string; range: string; short: string }> = {
  0: { name: 'Crítico', range: '0–55 px', short: '0–55px' },
  1: { name: 'Ideal', range: '55–135 px', short: '55–135px' },
  2: { name: 'Médio', range: '135–225 px', short: '135–225px' },
  3: { name: 'Longe', range: '225–340 px', short: '225–340px' },
  4: { name: 'Seguro', range: '> 340 px', short: '>340px' },
};

export const OBSTACLE_LABELS: Record<ObstacleKind, string> = {
  0: 'Cacto Pequeno',
  1: 'Cacto Grande',
};

export const SPEED_LABELS: Record<SpeedTier, string> = {
  0: 'Vel. Normal',
  1: 'Vel. Rápida',
};

export interface QEntry {
  stateKey: string;
  distBucket: DistanceBucket;
  obstacleKind: ObstacleKind;
  speedTier: SpeedTier;
  qRun: number;
  qJump: number;
  visitsRun: number;
  visitsJump: number;
  lastUpdateSeq: number;
  lastUpdatedAction: Action | null;
  lastDelta: number;
}

export interface HyperParameters {
  alpha: number; // Taxa de aprendizado (0..1)
  gamma: number; // Fator de desconto (0..0.99)
  epsilon: number; // Taxa de exploração (0..1)
  autoDecay: boolean; // Decaimento automático de epsilon
}

export interface BellmanUpdateRecord {
  id: number;
  episode: number;
  stateKey: string;
  stateLabel: string;
  action: Action;
  reward: number;
  nextStateKey: string | null;
  nextStateLabel: string;
  oldQ: number;
  maxNextQ: number;
  newQ: number;
  delta: number;
  alpha: number;
  gamma: number;
  reason: string;
  wasExploration: boolean;
}

export function buildStateKey(
  distBucket: DistanceBucket,
  obstacleKind: ObstacleKind,
  speedTier: SpeedTier,
): string {
  return `d${distBucket}_o${obstacleKind}_v${speedTier}`;
}

export function formatStateLabel(
  distBucket: DistanceBucket,
  obstacleKind: ObstacleKind,
  speedTier: SpeedTier,
): string {
  return `${DISTANCE_LABELS[distBucket].name} · ${OBSTACLE_LABELS[obstacleKind]} · ${SPEED_LABELS[speedTier]}`;
}

export function discretizeDistance(gapPx: number): DistanceBucket {
  if (gapPx < 55) return 0;
  if (gapPx < 135) return 1;
  if (gapPx < 225) return 2;
  if (gapPx < 340) return 3;
  return 4;
}

export function discretizeSpeed(speedPxPerSec: number): SpeedTier {
  return speedPxPerSec >= 410 ? 1 : 0;
}

export function createInitialQTable(): QEntry[] {
  const entries: QEntry[] = [];
  const speeds: SpeedTier[] = [0, 1];
  const dists: DistanceBucket[] = [0, 1, 2, 3, 4];
  const obstacles: ObstacleKind[] = [0, 1];

  for (const speedTier of speeds) {
    for (const distBucket of dists) {
      for (const obstacleKind of obstacles) {
        entries.push({
          stateKey: buildStateKey(distBucket, obstacleKind, speedTier),
          distBucket,
          obstacleKind,
          speedTier,
          qRun: 0,
          qJump: 0,
          visitsRun: 0,
          visitsJump: 0,
          lastUpdateSeq: 0,
          lastUpdatedAction: null,
          lastDelta: 0,
        });
      }
    }
  }
  return entries;
}

export class QLearningAgent {
  public entries: QEntry[];
  public entryMap: Map<string, QEntry>;
  public updateSeq = 0;
  public lastBellman: BellmanUpdateRecord | null = null;
  public totalUpdates = 0;
  public explorationCount = 0;
  public exploitationCount = 0;

  constructor() {
    this.entries = createInitialQTable();
    this.entryMap = new Map(this.entries.map((e) => [e.stateKey, e]));
  }

  public reset(): void {
    this.entries = createInitialQTable();
    this.entryMap = new Map(this.entries.map((e) => [e.stateKey, e]));
    this.updateSeq = 0;
    this.lastBellman = null;
    this.totalUpdates = 0;
    this.explorationCount = 0;
    this.exploitationCount = 0;
  }

  public getEntry(stateKey: string): QEntry {
    const entry = this.entryMap.get(stateKey);
    if (!entry) {
      throw new Error(`Estado desconhecido na tabela Q: ${stateKey}`);
    }
    return entry;
  }

  public chooseAction(
    stateKey: string,
    epsilon: number,
  ): { action: Action; wasExploration: boolean } {
    const entry = this.getEntry(stateKey);

    // Política Epsilon-Greedy
    if (Math.random() < epsilon) {
      this.explorationCount++;
      // Pequeno viés didático inicial: 75% correr, 25% saltar na exploração para evitar saltos constantes no vazio
      const action: Action = Math.random() < 0.35 ? 1 : 0;
      return { action, wasExploration: true };
    }

    this.exploitationCount++;
    if (Math.abs(entry.qRun - entry.qJump) < 1e-6) {
      // Desempate inicial: prefere correr até aprender onde saltar
      return { action: 0, wasExploration: false };
    }
    return {
      action: entry.qJump > entry.qRun ? 1 : 0,
      wasExploration: false,
    };
  }

  public getMaxQ(stateKey: string): number {
    const entry = this.getEntry(stateKey);
    return Math.max(entry.qRun, entry.qJump);
  }

  public update(params: {
    episode: number;
    stateKey: string;
    action: Action;
    reward: number;
    nextStateKey: string | null; // null quando episódio termina em colisão
    alpha: number;
    gamma: number;
    reason: string;
    wasExploration: boolean;
  }): BellmanUpdateRecord {
    const {
      episode,
      stateKey,
      action,
      reward,
      nextStateKey,
      alpha,
      gamma,
      reason,
      wasExploration,
    } = params;

    const entry = this.getEntry(stateKey);
    const oldQ = action === 0 ? entry.qRun : entry.qJump;
    const maxNextQ = nextStateKey ? this.getMaxQ(nextStateKey) : 0;
    const tdTarget = reward + gamma * maxNextQ;
    const tdError = tdTarget - oldQ;
    const newQ = oldQ + alpha * tdError;

    this.updateSeq++;
    this.totalUpdates++;

    if (action === 0) {
      entry.qRun = newQ;
      entry.visitsRun++;
    } else {
      entry.qJump = newQ;
      entry.visitsJump++;
    }
    entry.lastUpdateSeq = this.updateSeq;
    entry.lastUpdatedAction = action;
    entry.lastDelta = newQ - oldQ;

    const nextEntry = nextStateKey ? this.getEntry(nextStateKey) : null;
    const record: BellmanUpdateRecord = {
      id: this.updateSeq,
      episode,
      stateKey,
      stateLabel: formatStateLabel(
        entry.distBucket,
        entry.obstacleKind,
        entry.speedTier,
      ),
      action,
      reward,
      nextStateKey,
      nextStateLabel: nextEntry
        ? formatStateLabel(
            nextEntry.distBucket,
            nextEntry.obstacleKind,
            nextEntry.speedTier,
          )
        : 'Estado Terminal (Colisão)',
      oldQ,
      maxNextQ,
      newQ,
      delta: newQ - oldQ,
      alpha,
      gamma,
      reason,
      wasExploration,
    };

    this.lastBellman = record;
    return record;
  }

  public getBestAction(entry: QEntry): Action | null {
    if (entry.visitsRun === 0 && entry.visitsJump === 0) return null;
    if (Math.abs(entry.qRun - entry.qJump) < 0.05) return null;
    return entry.qJump > entry.qRun ? 1 : 0;
  }

  public getKnowledgeCoverage(): { visitedStates: number; totalStates: number } {
    let visited = 0;
    for (const e of this.entries) {
      if (e.visitsRun > 0 || e.visitsJump > 0) visited++;
    }
    return { visitedStates: visited, totalStates: this.entries.length };
  }
}

export function describeStateDidactic(entry: QEntry): string {
  const best =
    Math.abs(entry.qRun - entry.qJump) < 0.05
      ? 'Indeciso'
      : entry.qJump > entry.qRun
        ? 'SALTAR'
        : 'CORRER';

  const distDesc = DISTANCE_LABELS[entry.distBucket];
  const obsDesc = OBSTACLE_LABELS[entry.obstacleKind];
  const spdDesc = SPEED_LABELS[entry.speedTier];

  if (entry.visitsRun === 0 && entry.visitsJump === 0) {
    return `Estado "${distDesc.name} · ${obsDesc} · ${spdDesc}" ainda não foi explorado pelo agente. Ambos os valores Q iniciam em 0.00.`;
  }

  return `Em "${distDesc.name} (${distDesc.range})" diante de ${obsDesc} (${spdDesc}), o agente acumula Q(Correr)=${entry.qRun.toFixed(2)} e Q(Saltar)=${entry.qJump.toFixed(2)}. Política atual: ${best}.`;
}
