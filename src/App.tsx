import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Eye,
  EyeOff,
  Gamepad2,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { BellmanInspector } from './components/BellmanInspector';
import { QTableVisualizer } from './components/QTableVisualizer';
import { TitleScreen } from './components/TitleScreen';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  ControlMode,
  DinoSimulation,
  SimulationSnapshot,
} from './engine/dinoSimulation';
import { HyperParameters, QLearningAgent } from './engine/qLearning';
import { soundSynth } from './engine/sound';

type GamePhase = 'TITLE_MENU' | 'PLAYING' | 'PAUSED';

const SPEED_OPTIONS = [1, 5, 20, 50] as const;
const FIXED_DT = 1 / 60;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const agentRef = useRef<QLearningAgent>(new QLearningAgent());
  const simRef = useRef<DinoSimulation>(new DinoSimulation(agentRef.current));

  const [phase, setPhase] = useState<GamePhase>('TITLE_MENU');
  const [mode, setMode] = useState<ControlMode>('agent');
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [showSensors, setShowSensors] = useState<boolean>(true);
  const [muted, setMuted] = useState<boolean>(false);

  const [hyper, setHyper] = useState<HyperParameters>({
    alpha: 0.2,
    gamma: 0.9,
    epsilon: 0.35,
    autoDecay: true,
  });
  const hyperRef = useRef<HyperParameters>(hyper);
  hyperRef.current = hyper;

  const [snapshot, setSnapshot] = useState<SimulationSnapshot>(() =>
    simRef.current.getSnapshot(),
  );
  const [uiTick, setUiTick] = useState<number>(0);

  const phaseRef = useRef<GamePhase>(phase);
  phaseRef.current = phase;

  const syncUiFromSim = useCallback(() => {
    setSnapshot(simRef.current.getSnapshot());
    setHyper((prev) =>
      Math.abs(prev.epsilon - hyperRef.current.epsilon) > 0.0005
        ? { ...prev, epsilon: hyperRef.current.epsilon }
        : prev,
    );
    setUiTick((t) => t + 1);
  }, []);

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = CANVAS_WIDTH * dpr;
    const targetH = CANVAS_HEIGHT * dpr;
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    simRef.current.render(ctx);
    ctx.restore();
  }, []);

  // Loop principal isolado em requestAnimationFrame
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    let accumulator = 0;
    let lastUiSync = performance.now();

    const loop = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const clampedDt = Math.min(rawDt, 0.05);

      if (phaseRef.current === 'PLAYING') {
        const sim = simRef.current;
        accumulator += clampedDt * sim.speedMultiplier;

        // Limite de passos por frame para evitar travamentos em hardware lento
        let steps = 0;
        const maxSteps = Math.max(4, sim.speedMultiplier * 2);
        while (accumulator >= FIXED_DT && steps < maxSteps) {
          sim.stepFixed(FIXED_DT, hyperRef.current);
          accumulator -= FIXED_DT;
          steps++;
        }
        if (steps >= maxSteps) {
          accumulator = 0;
        }
      }

      renderCanvas();

      if (now - lastUiSync >= 55) {
        lastUiSync = now;
        syncUiFromSim();
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [renderCanvas, syncUiFromSim]);

  // Sincroniza configurações com a simulação
  useEffect(() => {
    simRef.current.mode = mode;
  }, [mode]);

  useEffect(() => {
    simRef.current.speedMultiplier = speedMultiplier;
  }, [speedMultiplier]);

  useEffect(() => {
    simRef.current.showSensors = showSensors;
  }, [showSensors]);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      soundSynth.muted = next;
      return next;
    });
  }, []);

  const handleStartFromTitle = useCallback(
    (chosenMode: ControlMode) => {
      setMode(chosenMode);
      simRef.current.mode = chosenMode;
      simRef.current.resetEpisode(false);
      setPhase('PLAYING');
      syncUiFromSim();
    },
    [syncUiFromSim],
  );

  const handleStepOnce = useCallback(() => {
    setPhase('PAUSED');
    simRef.current.stepFixed(FIXED_DT, hyperRef.current);
    renderCanvas();
    syncUiFromSim();
  }, [renderCanvas, syncUiFromSim]);

  const handleResetMemory = useCallback(() => {
    simRef.current.resetFull();
    setHyper((prev) => ({ ...prev, epsilon: 0.35 }));
    renderCanvas();
    syncUiFromSim();
  }, [renderCanvas, syncUiFromSim]);

  const handleModeSwitch = useCallback(
    (nextMode: ControlMode) => {
      setMode(nextMode);
      simRef.current.mode = nextMode;
      simRef.current.resetEpisode(false);
      if (phase === 'PAUSED') {
        setPhase('PLAYING');
      }
      syncUiFromSim();
    },
    [phase, syncUiFromSim],
  );

  // Atalhos de teclado
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (phaseRef.current === 'TITLE_MENU') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          handleStartFromTitle('agent');
        }
        return;
      }

      if (e.code === 'KeyP') {
        e.preventDefault();
        setPhase((p) => (p === 'PLAYING' ? 'PAUSED' : 'PLAYING'));
        return;
      }

      if (e.code === 'KeyM') {
        e.preventDefault();
        handleToggleMute();
        return;
      }

      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        if (simRef.current.mode === 'manual') {
          e.preventDefault();
          if (simRef.current.crashedManual) {
            simRef.current.resetEpisode(true);
            syncUiFromSim();
          } else {
            simRef.current.requestManualJump();
          }
        }
      }
    };

    const onBlur = () => {
      // Limpa qualquer estado pendente de pausa em janela perdida se desejar
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', onBlur);
    };
  }, [handleStartFromTitle, handleToggleMute, syncUiFromSim]);

  // Força leitura reativa atualizada da Tabela Q
  void uiTick;
  const agent = agentRef.current;

  return (
    <div className="min-h-screen bg-[#F4F5F7] text-[#182230] flex flex-col">
      {phase === 'TITLE_MENU' && (
        <TitleScreen onStart={handleStartFromTitle} />
      )}

      {/* Barra Superior Limpa */}
      <header className="bg-white border-b border-slate-200 px-4 lg:px-6 py-3">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
              Dino Q-Learning Lab
            </span>
            <span className="hidden sm:inline text-xs text-slate-500">
              Aprendizagem por Reforço · Estados Discretos · Tabela Q
            </span>
          </div>

          {/* Seletor de Modo: Agente vs Manual */}
          <div
            role="group"
            aria-label="Modo de controle"
            className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
          >
            <button
              type="button"
              onClick={() => handleModeSwitch('agent')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                mode === 'agent'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-[#0284C7]" />
              Agente Q-Learning
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch('manual')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                mode === 'manual'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Gamepad2 className="w-3.5 h-3.5 text-slate-600" />
              Jogador Manual
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleToggleMute}
              aria-label={muted ? 'Ativar som' : 'Silenciar som'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {muted ? (
                <VolumeX className="w-3.5 h-3.5" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">{muted ? 'Mudo' : 'Som'}</span>
            </button>

            <button
              type="button"
              onClick={handleResetMemory}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reiniciar Memória
            </button>
          </div>
        </div>
      </header>

      {/* Workspace Principal em 2 Zonas (Estágio do Jogo + Memória Q) */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto p-4 lg:p-6 grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Coluna Esquerda: Simulação, Controles e Bellman */}
        <div className="xl:col-span-7 flex flex-col gap-4 min-w-0">
          {/* Palco do Jogo (Canvas) */}
          <div className="relative bg-[#F8F5EE] border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <canvas
              ref={canvasRef}
              onClick={() => {
                if (mode === 'manual') {
                  if (snapshot.crashedManual) {
                    simRef.current.resetEpisode(true);
                    syncUiFromSim();
                  } else {
                    simRef.current.requestManualJump();
                  }
                }
              }}
              className="block w-full aspect-[860/300] cursor-pointer select-none"
            />

            {/* Overlay de Pausa */}
            {phase === 'PAUSED' && (
              <div className="absolute inset-0 bg-slate-900/35 flex items-center justify-center p-4">
                <div className="bg-white border border-slate-200 rounded-xl px-6 py-5 shadow-sm text-center space-y-3 max-w-xs">
                  <h2 className="font-display text-lg font-semibold text-slate-900">
                    Simulação Pausada
                  </h2>
                  <p className="text-xs text-slate-600">
                    Inspecione a Tabela Q ao lado ou avance frame a frame para observar a decisão do agente.
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPhase('PLAYING')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Retomar
                    </button>
                    <button
                      type="button"
                      onClick={handleStepOnce}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium transition-colors cursor-pointer"
                    >
                      <SkipForward className="w-3.5 h-3.5" />
                      +1 Passo
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Overlay de Game Over no Modo Manual */}
            {mode === 'manual' && snapshot.crashedManual && phase === 'PLAYING' && (
              <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center p-4">
                <div className="bg-white border border-slate-200 rounded-xl px-6 py-5 shadow-sm text-center space-y-3 max-w-xs">
                  <h2 className="font-display text-lg font-semibold text-slate-900">
                    Fim da Corrida
                  </h2>
                  <p className="text-xs text-slate-600 font-mono-tabular">
                    Pontuação: <strong className="text-slate-900">{snapshot.score}</strong> · Obstáculos:{' '}
                    <strong className="text-slate-900">{snapshot.obstaclesCleared}</strong>
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        simRef.current.resetEpisode(true);
                        syncUiFromSim();
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Jogar Novamente
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModeSwitch('agent')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium transition-colors cursor-pointer"
                    >
                      Ver Agente
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Barra de Controles de Execução e Hiperparâmetros */}
          <section
            aria-label="Controles da simulação e hiperparâmetros do Q-Learning"
            className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-4"
          >
            {/* Linha 1: Playback, Velocidade e Sensores */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setPhase((p) => (p === 'PLAYING' ? 'PAUSED' : 'PLAYING'))
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  {phase === 'PLAYING' ? (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      Pausar
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      Retomar
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleStepOnce}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  Passo
                </button>

                <button
                  type="button"
                  onClick={() => setShowSensors((s) => !s)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  {showSensors ? (
                    <Eye className="w-3.5 h-3.5 text-[#0284C7]" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5" />
                  )}
                  Sensores
                </button>

                {mode === 'manual' && (
                  <button
                    type="button"
                    onClick={() => simRef.current.requestManualJump()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Saltar (Espaço)
                  </button>
                )}
              </div>

              {/* Controle de Velocidade */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">
                  Velocidade
                </span>
                <div
                  role="group"
                  aria-label="Multiplicador de velocidade"
                  className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
                >
                  {SPEED_OPTIONS.map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => setSpeedMultiplier(spd)}
                      className={`px-2.5 py-1 text-xs font-mono-tabular font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        speedMultiplier === spd
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Linha 2: Hiperparâmetros do Q-Learning */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <label className="block space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">
                    Aprendizado (α)
                  </span>
                  <span className="font-mono-tabular font-semibold text-slate-900">
                    {hyper.alpha.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="1"
                  step="0.05"
                  value={hyper.alpha}
                  onChange={(e) =>
                    setHyper((h) => ({ ...h, alpha: parseFloat(e.target.value) }))
                  }
                  className="w-full lab-slider"
                />
                <p className="text-[11px] text-slate-500">
                  Peso dado a novas experiências.
                </p>
              </label>

              <label className="block space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">
                    Desconto (γ)
                  </span>
                  <span className="font-mono-tabular font-semibold text-slate-900">
                    {hyper.gamma.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="0.99"
                  step="0.01"
                  value={hyper.gamma}
                  onChange={(e) =>
                    setHyper((h) => ({ ...h, gamma: parseFloat(e.target.value) }))
                  }
                  className="w-full lab-slider"
                />
                <p className="text-[11px] text-slate-500">
                  Importância das recompensas futuras.
                </p>
              </label>

              <div className="space-y-1.5">
                <label className="block space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">
                      Exploração (ε)
                    </span>
                    <span className="font-mono-tabular font-semibold text-slate-900">
                      {(hyper.epsilon * 100).toFixed(0)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={hyper.epsilon}
                    onChange={(e) =>
                      setHyper((h) => ({
                        ...h,
                        epsilon: parseFloat(e.target.value),
                      }))
                    }
                    className="w-full lab-slider"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hyper.autoDecay}
                    onChange={(e) =>
                      setHyper((h) => ({ ...h, autoDecay: e.target.checked }))
                    }
                    className="rounded border-slate-300 text-[#0284C7] focus:ring-[#0284C7]"
                  />
                  Reduzir ε automaticamente a cada episódio
                </label>
              </div>
            </div>
          </section>

          {/* Bellman & Curva de Aprendizagem */}
          <BellmanInspector
            lastBellman={agent.lastBellman}
            episodeHistory={snapshot.episodeHistory}
            bestScore={snapshot.bestScore}
          />

          {/* Resumo Didático dos Estados e Recompensas */}
          <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="space-y-1">
              <h4 className="font-display font-semibold text-slate-900">
                1. Espaço de Estados (S)
              </h4>
              <p className="text-slate-600 leading-relaxed">
                O mundo contínuo é discretizado em{' '}
                <strong className="text-slate-900">20 estados</strong>: 5 faixas de distância até o cacto × 2 tamanhos de obstáculo × 2 faixas de velocidade.
              </p>
            </div>
            <div className="space-y-1">
              <h4 className="font-display font-semibold text-slate-900">
                2. Ações Permitidas (A)
              </h4>
              <p className="text-slate-600 leading-relaxed">
                Quando está no solo, o dinossauro decide entre{' '}
                <strong className="text-[#059669]">CORRER</strong> ou{' '}
                <strong className="text-[#0284C7]">SALTAR</strong>. No ar, aguarda o pouso para avaliar o resultado do salto.
              </p>
            </div>
            <div className="space-y-1">
              <h4 className="font-display font-semibold text-slate-900">
                3. Sinais de Recompensa (R)
              </h4>
              <p className="text-slate-600 leading-relaxed font-mono-tabular">
                Superar cacto: +15 · Correr seguro: +0.4 · Salto no vazio: -3 · Colisão: -100.
              </p>
            </div>
          </section>
        </div>

        {/* Coluna Direita: Tabela Q em Tempo Real */}
        <div className="xl:col-span-5 xl:h-[calc(100vh-108px)] xl:sticky xl:top-5 min-w-0">
          <QTableVisualizer
            entries={agent.entries}
            activeStateKey={snapshot.perception.stateKey}
            updateSeq={agent.updateSeq}
            totalUpdates={agent.totalUpdates}
          />
        </div>
      </main>
    </div>
  );
}
