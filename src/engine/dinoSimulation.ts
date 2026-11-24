import {
  Action,
  ACTION_LABELS,
  DISTANCE_LABELS,
  DistanceBucket,
  discretizeDistance,
  discretizeSpeed,
  formatStateLabel,
  HyperParameters,
  OBSTACLE_LABELS,
  ObstacleKind,
  QLearningAgent,
  SPEED_LABELS,
  SpeedTier,
  buildStateKey,
} from './qLearning';
import { soundSynth } from './sound';

export const CANVAS_WIDTH = 860;
export const CANVAS_HEIGHT = 300;
export const GROUND_Y = 248;

export type ControlMode = 'agent' | 'manual';

export interface Obstacle {
  id: number;
  x: number;
  width: number;
  height: number;
  kind: ObstacleKind;
  passed: boolean;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
}

interface FloatingFeedback {
  text: string;
  x: number;
  y: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface EpisodeSummary {
  episode: number;
  score: number;
  obstaclesCleared: number;
  totalReward: number;
  epsilon: number;
}

export interface LivePerception {
  stateKey: string;
  stateLabel: string;
  distBucket: DistanceBucket;
  obstacleKind: ObstacleKind;
  speedTier: SpeedTier;
  gapPx: number;
  speedPxPerSec: number;
  onGround: boolean;
  currentAction: Action;
  wasExploration: boolean;
}

export interface SimulationSnapshot {
  episode: number;
  score: number;
  bestScore: number;
  obstaclesCleared: number;
  episodeReward: number;
  speedPxPerSec: number;
  perception: LivePerception;
  episodeHistory: EpisodeSummary[];
  crashedManual: boolean;
}

interface PendingDecision {
  stateKey: string;
  action: Action;
  wasExploration: boolean;
  clearedInAir: boolean;
  framesElapsed: number;
}

export class DinoSimulation {
  public agent: QLearningAgent;
  public mode: ControlMode = 'agent';
  public showSensors = true;
  public speedMultiplier = 1;

  // Dino physical state
  public dinoX = 84;
  public dinoY = GROUND_Y;
  public dinoVy = 0;
  public readonly dinoWidth = 38;
  public readonly dinoHeight = 44;
  public onGround = true;
  private scaleX = 1;
  private scaleY = 1;
  private legPhase = 0;
  private blinkTimer = 2.4;

  // World state
  public speed = 320;
  private readonly baseSpeed = 320;
  private readonly maxSpeed = 540;
  public obstacles: Obstacle[] = [];
  private nextObstacleId = 1;
  private spawnCooldownPx = 220;
  private groundScroll = 0;
  private cloudOffset = 0;
  private mesaOffset = 0;

  // Episode metrics
  public episode = 1;
  public score = 0;
  private distanceAccum = 0;
  public bestScore = 0;
  public obstaclesCleared = 0;
  public episodeReward = 0;
  public episodeHistory: EpisodeSummary[] = [];

  // RL decision tracking
  private pendingDecision: PendingDecision | null = null;
  private lastChosenAction: Action = 0;
  private lastWasExploration = false;

  // Game feel (particles, hitstop, shake, crash delay)
  private particles: Particle[] = [];
  private feedbacks: FloatingFeedback[] = [];
  private shakeTimer = 0;
  private hitstopTimer = 0;
  private crashFlashTimer = 0;
  private crashCooldownTimer = 0;
  public crashedManual = false;

  // Manual jump buffer
  private jumpBufferTimer = 0;

  constructor(agent: QLearningAgent) {
    this.agent = agent;
    for (let i = 0; i < 48; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 3,
        life: 0,
        maxLife: 0.4,
        color: '#94A3B8',
      });
    }
    this.resetEpisode(false);
  }

  public requestManualJump(): void {
    this.jumpBufferTimer = 0.14; // 140ms input buffer
  }

  public resetFull(): void {
    this.agent.reset();
    this.episode = 1;
    this.bestScore = 0;
    this.episodeHistory = [];
    this.crashedManual = false;
    this.resetEpisode(false);
  }

  public resetEpisode(incrementEpisode = true): void {
    if (incrementEpisode) {
      this.episode++;
    }
    this.dinoY = GROUND_Y;
    this.dinoVy = 0;
    this.onGround = true;
    this.scaleX = 1;
    this.scaleY = 1;
    this.speed = this.baseSpeed;
    this.obstacles = [];
    this.spawnCooldownPx = 260;
    this.score = 0;
    this.distanceAccum = 0;
    this.obstaclesCleared = 0;
    this.episodeReward = 0;
    this.pendingDecision = null;
    this.lastChosenAction = 0;
    this.lastWasExploration = false;
    this.crashFlashTimer = 0;
    this.crashCooldownTimer = 0;
    this.hitstopTimer = 0;
    this.shakeTimer = 0;
    this.crashedManual = false;
    this.jumpBufferTimer = 0;
    this.feedbacks = [];

    // Spawn first obstacle ahead at a predictable distance
    this.spawnObstacle(460);
  }

  private spawnObstacle(xPos: number): void {
    const kind: ObstacleKind = Math.random() < 0.48 ? 1 : 0;
    const width = kind === 0 ? 22 : 44;
    const height = kind === 0 ? 38 : 54;
    this.obstacles.push({
      id: this.nextObstacleId++,
      x: xPos,
      width,
      height,
      kind,
      passed: false,
    });
  }

  private emitParticles(
    x: number,
    y: number,
    count: number,
    color: string,
    spreadVx: number,
    spreadVy: number,
  ): void {
    if (this.speedMultiplier > 5) return; // Evitar custo visual em modo Turbo
    let spawned = 0;
    for (const p of this.particles) {
      if (!p.active) {
        p.active = true;
        p.x = x + (Math.random() - 0.5) * 10;
        p.y = y + (Math.random() - 0.5) * 6;
        p.vx = (Math.random() - 0.5) * spreadVx - 60;
        p.vy = -Math.random() * spreadVy;
        p.size = 2 + Math.random() * 3;
        p.maxLife = 0.28 + Math.random() * 0.25;
        p.life = p.maxLife;
        p.color = color;
        spawned++;
        if (spawned >= count) break;
      }
    }
  }

  private pushFeedback(text: string, x: number, y: number, color: string): void {
    if (this.speedMultiplier > 5) return;
    this.feedbacks.push({
      text,
      x,
      y,
      color,
      life: 0.75,
      maxLife: 0.75,
    });
    if (this.feedbacks.length > 5) {
      this.feedbacks.shift();
    }
  }

  public getCurrentPerception(): LivePerception {
    const nextObs = this.getNextObstacle();
    const dinoFront = this.dinoX + this.dinoWidth;
    const gapPx = nextObs ? Math.max(0, nextObs.x - dinoFront) : 520;
    const distBucket = discretizeDistance(gapPx);
    const obstacleKind: ObstacleKind = nextObs ? nextObs.kind : 0;
    const speedTier = discretizeSpeed(this.speed);
    const stateKey = buildStateKey(distBucket, obstacleKind, speedTier);

    return {
      stateKey,
      stateLabel: formatStateLabel(distBucket, obstacleKind, speedTier),
      distBucket,
      obstacleKind,
      speedTier,
      gapPx: Math.round(gapPx),
      speedPxPerSec: Math.round(this.speed),
      onGround: this.onGround,
      currentAction: this.lastChosenAction,
      wasExploration: this.lastWasExploration,
    };
  }

  private getNextObstacle(): Obstacle | null {
    for (const obs of this.obstacles) {
      if (obs.x + obs.width >= this.dinoX + 6) {
        return obs;
      }
    }
    return null;
  }

  public stepFixed(dt: number, hyper: HyperParameters): { episodeEnded: boolean } {
    let episodeEnded = false;

    // Timers visuais
    if (this.shakeTimer > 0) this.shakeTimer = Math.max(0, this.shakeTimer - dt);
    if (this.crashFlashTimer > 0) this.crashFlashTimer = Math.max(0, this.crashFlashTimer - dt);

    // Hitstop no modo normal
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      return { episodeEnded: false };
    }

    // Cooldown pós-colisão antes de reiniciar automaticamente no modo Agente
    if (this.crashCooldownTimer > 0) {
      this.crashCooldownTimer -= dt;
      if (this.crashCooldownTimer <= 0 && this.mode === 'agent') {
        this.resetEpisode(true);
      }
      return { episodeEnded: false };
    }

    if (this.crashedManual) {
      return { episodeEnded: false };
    }

    // Atualizar partículas e textos flutuantes
    for (const p of this.particles) {
      if (p.active) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 450 * dt;
        p.life -= dt;
        if (p.life <= 0) p.active = false;
      }
    }
    for (let i = this.feedbacks.length - 1; i >= 0; i--) {
      const f = this.feedbacks[i];
      f.y -= 28 * dt;
      f.life -= dt;
      if (f.life <= 0) this.feedbacks.splice(i, 1);
    }

    // Suavizar squash & stretch de volta para (1, 1)
    this.scaleX += (1 - this.scaleX) * Math.min(1, dt * 14);
    this.scaleY += (1 - this.scaleY) * Math.min(1, dt * 14);

    // Piscada ocasional do dino
    this.blinkTimer -= dt;
    if (this.blinkTimer < -0.12) {
      this.blinkTimer = 2.2 + Math.random() * 2.5;
    }

    if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    }

    // 1. Tomada de decisão no chão
    const perceptionBefore = this.getCurrentPerception();

    if (this.mode === 'agent') {
      if (this.onGround) {
        // Se havia uma decisão anterior de SALTAR concluída agora ao tocar o solo
        if (this.pendingDecision && this.pendingDecision.action === 1) {
          const reward = this.pendingDecision.clearedInAir ? 15 : -3;
          const reason = this.pendingDecision.clearedInAir
            ? 'Obstáculo superado (+15)'
            : 'Salto no vazio (-3)';
          this.episodeReward += reward;
          this.agent.update({
            episode: this.episode,
            stateKey: this.pendingDecision.stateKey,
            action: 1,
            reward,
            nextStateKey: perceptionBefore.stateKey,
            alpha: hyper.alpha,
            gamma: hyper.gamma,
            reason,
            wasExploration: this.pendingDecision.wasExploration,
          });
          if (this.pendingDecision.clearedInAir) {
            this.pushFeedback('+15', this.dinoX + 20, this.dinoY - 56, '#059669');
          } else {
            this.pushFeedback('-3', this.dinoX + 20, this.dinoY - 56, '#D97706');
          }
          this.pendingDecision = null;
        } else if (this.pendingDecision && this.pendingDecision.action === 0) {
          this.pendingDecision.framesElapsed++;
          // Atualiza a ação CORRER a cada 4 frames ou se o estado mudou
          if (
            this.pendingDecision.framesElapsed >= 4 ||
            this.pendingDecision.stateKey !== perceptionBefore.stateKey
          ) {
            const reward = 0.4;
            this.episodeReward += reward;
            this.agent.update({
              episode: this.episode,
              stateKey: this.pendingDecision.stateKey,
              action: 0,
              reward,
              nextStateKey: perceptionBefore.stateKey,
              alpha: hyper.alpha,
              gamma: hyper.gamma,
              reason: 'Corrida segura (+0.4)',
              wasExploration: this.pendingDecision.wasExploration,
            });
            this.pendingDecision = null;
          }
        }

        // Nova decisão se não há pendente
        if (!this.pendingDecision) {
          const choice = this.agent.chooseAction(
            perceptionBefore.stateKey,
            hyper.epsilon,
          );
          this.lastChosenAction = choice.action;
          this.lastWasExploration = choice.wasExploration;

          if (choice.action === 1) {
            this.triggerJump();
          }

          this.pendingDecision = {
            stateKey: perceptionBefore.stateKey,
            action: choice.action,
            wasExploration: choice.wasExploration,
            clearedInAir: false,
            framesElapsed: 0,
          };
        }
      }
    } else {
      // Modo Manual
      if (this.onGround && this.jumpBufferTimer > 0) {
        this.triggerJump();
        this.jumpBufferTimer = 0;
        this.lastChosenAction = 1;
        this.lastWasExploration = false;
      } else if (this.onGround) {
        this.lastChosenAction = 0;
      }
    }

    // 2. Física do dinossauro
    const wasAirborne = !this.onGround;
    if (!this.onGround) {
      this.dinoVy += 1750 * dt;
      this.dinoY += this.dinoVy * dt;
      if (this.dinoY >= GROUND_Y) {
        this.dinoY = GROUND_Y;
        this.dinoVy = 0;
        this.onGround = true;
        this.scaleX = 1.18;
        this.scaleY = 0.84;
        if (wasAirborne) {
          this.emitParticles(this.dinoX + 18, GROUND_Y, 5, '#C2B59B', 80, 45);
        }
      }
    } else {
      this.legPhase += dt * (this.speed * 0.045);
      if (Math.random() < 0.16 && this.speedMultiplier <= 2) {
        this.emitParticles(this.dinoX + 8, GROUND_Y, 1, '#D6CBB8', 35, 25);
      }
    }

    // 3. Movimento do mundo e obstáculos
    this.speed = Math.min(this.maxSpeed, this.baseSpeed + this.score * 0.22);
    const dx = this.speed * dt;
    this.groundScroll = (this.groundScroll + dx) % 60;
    this.cloudOffset = (this.cloudOffset + dx * 0.14) % (CANVAS_WIDTH + 160);
    this.mesaOffset = (this.mesaOffset + dx * 0.25) % 480;

    this.distanceAccum += dx;
    if (this.distanceAccum >= 18) {
      this.score += Math.floor(this.distanceAccum / 18);
      this.distanceAccum %= 18;
      if (this.score > this.bestScore) {
        this.bestScore = this.score;
      }
    }

    this.spawnCooldownPx -= dx;
    if (this.spawnCooldownPx <= 0) {
      this.spawnObstacle(CANVAS_WIDTH + 40);
      const minGap = 270 + (this.speed - this.baseSpeed) * 0.45;
      const maxGap = minGap + 185;
      this.spawnCooldownPx = minGap + Math.random() * (maxGap - minGap);
    }

    for (const obs of this.obstacles) {
      obs.x -= dx;
      if (!obs.passed && obs.x + obs.width < this.dinoX) {
        obs.passed = true;
        this.obstaclesCleared++;
        if (this.pendingDecision && this.pendingDecision.action === 1) {
          this.pendingDecision.clearedInAir = true;
        }
        if (this.speedMultiplier <= 2) {
          if (this.obstaclesCleared > 0 && this.obstaclesCleared % 5 === 0) {
            soundSynth.playMilestone();
          } else {
            soundSynth.playClear();
          }
        }
      }
    }
    this.obstacles = this.obstacles.filter((o) => o.x + o.width > -40);

    // 4. Verificação de colisão (hitbox justa e ligeiramente perdoadora)
    const dinoBox = {
      x: this.dinoX + 7,
      y: this.dinoY - this.dinoHeight + 5,
      w: this.dinoWidth - 14,
      h: this.dinoHeight - 8,
    };

    for (const obs of this.obstacles) {
      const obsBox = {
        x: obs.x + 4,
        y: GROUND_Y - obs.height + 4,
        w: obs.width - 8,
        h: obs.height - 4,
      };

      const collided =
        dinoBox.x < obsBox.x + obsBox.w &&
        dinoBox.x + dinoBox.w > obsBox.x &&
        dinoBox.y < obsBox.y + obsBox.h &&
        dinoBox.y + dinoBox.h > obsBox.y;

      if (collided) {
        episodeEnded = true;
        this.handleCollision(hyper);
        break;
      }
    }

    return { episodeEnded };
  }

  private triggerJump(): void {
    this.dinoVy = -610;
    this.onGround = false;
    this.scaleX = 0.86;
    this.scaleY = 1.18;
    this.emitParticles(this.dinoX + 18, GROUND_Y, 6, '#C2B59B', 90, 60);
    if (this.speedMultiplier <= 2) {
      soundSynth.playJump();
    }
  }

  private handleCollision(hyper: HyperParameters): void {
    this.crashFlashTimer = 0.22;
    if (this.speedMultiplier <= 2) {
      this.hitstopTimer = 0.045;
      this.shakeTimer = 0.18;
      soundSynth.playCrash();
    }
    this.emitParticles(this.dinoX + 20, this.dinoY - 20, 14, '#DC2626', 220, 220);

    if (this.mode === 'agent') {
      if (this.pendingDecision) {
        const reward = -100;
        this.episodeReward += reward;
        this.agent.update({
          episode: this.episode,
          stateKey: this.pendingDecision.stateKey,
          action: this.pendingDecision.action,
          reward,
          nextStateKey: null, // Estado terminal
          alpha: hyper.alpha,
          gamma: hyper.gamma,
          reason: 'Colisão fatal (-100)',
          wasExploration: this.pendingDecision.wasExploration,
        });
        this.pendingDecision = null;
      }
      this.pushFeedback('-100', this.dinoX + 22, this.dinoY - 64, '#DC2626');

      this.episodeHistory.push({
        episode: this.episode,
        score: this.score,
        obstaclesCleared: this.obstaclesCleared,
        totalReward: Math.round(this.episodeReward * 10) / 10,
        epsilon: hyper.epsilon,
      });
      if (this.episodeHistory.length > 120) {
        this.episodeHistory.shift();
      }

      if (hyper.autoDecay) {
        hyper.epsilon = Math.max(0.02, Number((hyper.epsilon * 0.965).toFixed(4)));
      }

      if (this.speedMultiplier === 1) {
        this.crashCooldownTimer = 0.28;
      } else {
        this.resetEpisode(true);
      }
    } else {
      this.crashedManual = true;
    }
  }

  public getSnapshot(): SimulationSnapshot {
    return {
      episode: this.episode,
      score: this.score,
      bestScore: this.bestScore,
      obstaclesCleared: this.obstaclesCleared,
      episodeReward: Math.round(this.episodeReward * 10) / 10,
      speedPxPerSec: Math.round(this.speed),
      perception: this.getCurrentPerception(),
      episodeHistory: [...this.episodeHistory],
      crashedManual: this.crashedManual,
    };
  }

  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    // Camera shake
    if (this.shakeTimer > 0) {
      const mag = (this.shakeTimer / 0.18) * 5;
      ctx.translate(
        (Math.random() - 0.5) * mag * 2,
        (Math.random() - 0.5) * mag * 2,
      );
    }

    // 1. Céu arenito claro
    const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    skyGrad.addColorStop(0, '#F8F5EE');
    skyGrad.addColorStop(1, '#F2ECE1');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 2. Nuvens geométricas suaves
    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
    for (let i = 0; i < 4; i++) {
      const cx =
        ((i * 255 - this.cloudOffset + CANVAS_WIDTH + 160) %
          (CANVAS_WIDTH + 160)) -
        80;
      const cy = 42 + (i % 2) * 34;
      ctx.beginPath();
      ctx.roundRect(cx, cy, 62, 16, 8);
      ctx.roundRect(cx + 14, cy - 10, 32, 14, 7);
      ctx.fill();
    }

    // 3. Silhuetas distantes de chapadas (parallax)
    ctx.fillStyle = '#E6DFD1';
    for (let i = -1; i < 3; i++) {
      const mx = i * 480 - this.mesaOffset;
      ctx.beginPath();
      ctx.moveTo(mx + 20, GROUND_Y);
      ctx.lineTo(mx + 70, GROUND_Y - 46);
      ctx.lineTo(mx + 190, GROUND_Y - 46);
      ctx.lineTo(mx + 235, GROUND_Y);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(mx + 290, GROUND_Y);
      ctx.lineTo(mx + 330, GROUND_Y - 28);
      ctx.lineTo(mx + 410, GROUND_Y - 28);
      ctx.lineTo(mx + 445, GROUND_Y);
      ctx.closePath();
      ctx.fill();
    }

    // 4. Solo e textura de corrida
    ctx.fillStyle = '#E9E2D3';
    ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y);

    ctx.strokeStyle = '#9E937E';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(CANVAS_WIDTH, GROUND_Y);
    ctx.stroke();

    // Pedrinhas e marcas de solo
    ctx.fillStyle = '#BDB29C';
    for (let x = -this.groundScroll; x < CANVAS_WIDTH; x += 60) {
      ctx.fillRect(x + 12, GROUND_Y + 9, 8, 2);
      ctx.fillRect(x + 38, GROUND_Y + 18, 5, 2);
    }

    // 5. Zonas de discretização de distância (Sensores didáticos no solo)
    const perception = this.getCurrentPerception();
    const dinoFront = this.dinoX + this.dinoWidth;

    if (this.showSensors) {
      const buckets: Array<{ start: number; end: number; bucket: DistanceBucket; color: string }> = [
        { start: 0, end: 55, bucket: 0, color: '#DC2626' },
        { start: 55, end: 135, bucket: 1, color: '#0284C7' },
        { start: 135, end: 225, bucket: 2, color: '#D97706' },
        { start: 225, end: 340, bucket: 3, color: '#64748B' },
      ];

      for (const b of buckets) {
        const bx = dinoFront + b.start;
        const bw = b.end - b.start;
        const isActive = perception.distBucket === b.bucket;

        ctx.fillStyle = isActive ? `${b.color}1C` : `${b.color}08`;
        ctx.fillRect(bx, GROUND_Y + 2, bw, 22);

        ctx.strokeStyle = `${b.color}55`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bx + bw, GROUND_Y + 2);
        ctx.lineTo(bx + bw, GROUND_Y + 24);
        ctx.stroke();

        ctx.fillStyle = isActive ? b.color : '#64748B';
        ctx.font = isActive ? '600 10px "JetBrains Mono", monospace' : '500 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(DISTANCE_LABELS[b.bucket].name, bx + bw / 2, GROUND_Y + 17);
      }

      // Raio de percepção até o próximo obstáculo
      const nextObs = this.getNextObstacle();
      if (nextObs) {
        const rayY = GROUND_Y - 22;
        const targetX = Math.max(dinoFront, nextObs.x);
        const rayColor =
          perception.distBucket === 0
            ? '#DC2626'
            : perception.distBucket === 1
              ? '#0284C7'
              : perception.distBucket === 2
                ? '#D97706'
                : '#64748B';

        ctx.save();
        ctx.strokeStyle = rayColor;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(dinoFront, rayY);
        ctx.lineTo(targetX, rayY);
        ctx.stroke();
        ctx.restore();

        // Marcador de distância em px
        if (targetX - dinoFront > 36) {
          const midX = (dinoFront + targetX) / 2;
          ctx.fillStyle = '#FFFFFF';
          ctx.strokeStyle = rayColor;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(midX - 28, rayY - 19, 56, 16, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = rayColor;
          ctx.font = '600 10px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`${perception.gapPx} px`, midX, rayY - 8);
        }
      }
    }

    // 6. Obstáculos (Cactos)
    for (const obs of this.obstacles) {
      this.drawCactus(ctx, obs);
    }

    // 7. Partículas
    for (const p of this.particles) {
      if (!p.active) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // 8. Dinossauro
    this.drawDino(ctx);

    // 9. Etiqueta ao vivo da ação / estado sobre o Dino
    if (this.showSensors) {
      const badgeText = !this.onGround
        ? 'NO AR'
        : this.lastChosenAction === 1
          ? this.lastWasExploration
            ? 'SALTAR (Exploração)'
            : 'SALTAR (Política)'
          : this.lastWasExploration
            ? 'CORRER (Exploração)'
            : 'CORRER';

      const badgeColor = !this.onGround
        ? '#0284C7'
        : this.lastWasExploration
          ? '#D97706'
          : this.lastChosenAction === 1
            ? '#0284C7'
            : '#059669';

      ctx.font = '600 11px "DM Sans", sans-serif';
      const w = ctx.measureText(badgeText).width + 16;
      const bx = this.dinoX - 2;
      const by = this.dinoY - this.dinoHeight - 26;

      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = badgeColor;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(bx, by, w, 20, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = badgeColor;
      ctx.textAlign = 'left';
      ctx.fillText(badgeText, bx + 8, by + 13.5);
    }

    // 10. Feedback flutuante de recompensa (+15, -3, -100)
    for (const f of this.feedbacks) {
      ctx.globalAlpha = Math.min(1, f.life / f.maxLife);
      ctx.fillStyle = f.color;
      ctx.font = '700 13px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    // 11. Flash de colisão
    if (this.crashFlashTimer > 0) {
      ctx.fillStyle = `rgba(220, 38, 38, ${(this.crashFlashTimer / 0.22) * 0.22})`;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    // 12. HUD mínimo integrado no canto superior direito do canvas
    ctx.textAlign = 'right';
    ctx.fillStyle = '#475569';
    ctx.font = '500 11px "JetBrains Mono", monospace';
    ctx.fillText(
      `EP ${String(this.episode).padStart(3, '0')} · RECORDE ${String(this.bestScore).padStart(5, '0')}`,
      CANVAS_WIDTH - 16,
      24,
    );
    ctx.fillStyle = '#0F172A';
    ctx.font = '700 18px "JetBrains Mono", monospace';
    ctx.fillText(String(this.score).padStart(5, '0'), CANVAS_WIDTH - 16, 46);

    // Estado atual compacto no canto superior esquerdo
    if (this.showSensors) {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#475569';
      ctx.font = '500 11px "JetBrains Mono", monospace';
      ctx.fillText(
        `Estado: ${DISTANCE_LABELS[perception.distBucket].name} · ${OBSTACLE_LABELS[perception.obstacleKind]} · ${SPEED_LABELS[perception.speedTier]}`,
        16,
        24,
      );
      ctx.fillStyle = '#64748B';
      ctx.fillText(
        `Ação: ${ACTION_LABELS[perception.currentAction]} · Velocidade: ${perception.speedPxPerSec} px/s`,
        16,
        40,
      );
    }

    ctx.restore();
  }

  private drawCactus(ctx: CanvasRenderingContext2D, obs: Obstacle): void {
    const x = obs.x;
    const y = GROUND_Y;

    if (obs.kind === 0) {
      // Cacto pequeno único
      ctx.fillStyle = '#15803D';
      ctx.beginPath();
      ctx.roundRect(x + 7, y - obs.height, 8, obs.height, 4);
      ctx.fill();
      // Braço esquerdo
      ctx.beginPath();
      ctx.roundRect(x, y - 24, 9, 5, 2);
      ctx.roundRect(x, y - 32, 5, 12, 2);
      ctx.fill();
      // Braço direito
      ctx.beginPath();
      ctx.roundRect(x + 13, y - 19, 9, 5, 2);
      ctx.roundRect(x + 17, y - 28, 5, 14, 2);
      ctx.fill();

      // Highlight sutil
      ctx.fillStyle = '#22C55E';
      ctx.fillRect(x + 9, y - obs.height + 4, 2, obs.height - 8);
    } else {
      // Cacto grande (duplo / largo)
      ctx.fillStyle = '#166534';
      // Haste principal esquerda
      ctx.beginPath();
      ctx.roundRect(x + 8, y - obs.height, 10, obs.height, 4);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(x, y - 34, 10, 6, 2);
      ctx.roundRect(x, y - 45, 6, 15, 2);
      ctx.fill();

      // Haste secundária direita
      ctx.fillStyle = '#15803D';
      ctx.beginPath();
      ctx.roundRect(x + 26, y - (obs.height - 8), 9, obs.height - 8, 4);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(x + 33, y - 26, 11, 5, 2);
      ctx.roundRect(x + 38, y - 37, 6, 15, 2);
      ctx.fill();

      ctx.fillStyle = '#22C55E';
      ctx.fillRect(x + 10, y - obs.height + 5, 2, obs.height - 10);
      ctx.fillRect(x + 28, y - (obs.height - 12), 2, obs.height - 18);
    }
  }

  private drawDino(ctx: CanvasRenderingContext2D): void {
    const cx = this.dinoX + this.dinoWidth / 2;
    const by = this.dinoY;

    ctx.save();
    ctx.translate(cx, by);
    ctx.scale(this.scaleX, this.scaleY);

    const isCrashed = this.crashFlashTimer > 0 || this.crashedManual;
    const bodyColor = isCrashed ? '#991B1B' : '#1E293B';
    const accentColor = isCrashed ? '#FCA5A5' : '#334155';

    // Cauda
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.moveTo(-14, -18);
    ctx.lineTo(-24, -26);
    ctx.lineTo(-22, -16);
    ctx.lineTo(-12, -11);
    ctx.closePath();
    ctx.fill();

    // Tronco
    ctx.beginPath();
    ctx.roundRect(-14, -28, 22, 19, 5);
    ctx.fill();

    // Pescoço + Cabeça
    ctx.beginPath();
    ctx.roundRect(-2, -44, 21, 17, 4);
    ctx.fill();

    // Focinho / Mandíbula
    ctx.fillStyle = accentColor;
    ctx.fillRect(4, -31, 14, 3);

    // Crista dorsal sutil
    ctx.fillStyle = isCrashed ? '#EF4444' : '#0284C7';
    ctx.fillRect(-10, -31, 4, 3);
    ctx.fillRect(-15, -24, 3, 3);

    // Braço pequeno
    ctx.fillStyle = bodyColor;
    ctx.fillRect(8, -22, 7, 3);
    ctx.fillRect(13, -22, 2, 5);

    // Olho
    if (isCrashed) {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(8, -40);
      ctx.lineTo(13, -35);
      ctx.moveTo(13, -40);
      ctx.lineTo(8, -35);
      ctx.stroke();
    } else if (this.blinkTimer < 0) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(9, -38, 4, 1.5);
    } else {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(9, -40, 4, 4);
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(11, -39, 2, 2);
    }

    // Pernas (alternando na corrida, encolhidas no salto)
    ctx.fillStyle = bodyColor;
    if (!this.onGround) {
      ctx.fillRect(-9, -10, 5, 7);
      ctx.fillRect(1, -11, 5, 7);
    } else {
      const stride = Math.sin(this.legPhase);
      const leftH = stride > 0 ? 10 : 6;
      const rightH = stride > 0 ? 6 : 10;
      ctx.fillRect(-9, -10, 5, leftH);
      ctx.fillRect(1, -10, 5, rightH);
    }

    ctx.restore();
  }
}
